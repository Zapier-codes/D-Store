/**
 * Aptoide list crawl — the network runner. Leaf `5.h.ix.zo`.
 *
 * Pages through Aptoide's `listApps`, best-downloaded first, and appends the
 * apps it finds to a CANDIDATES file. A candidate is only a name to look up
 * later with `app/getMeta` (`5.h.x.zi`): list items carry no `file.malware`, so
 * nothing this script writes has passed the trust gate, and this script never
 * touches `storage/downloads/aptoide-snapshot.json`.
 *
 * All decisions about a page (what is a candidate, where the next page is, when
 * to stop, what the checkpoint looks like) are in `lib/aptoide-crawl.ts`
 * (`5.h.ix.zi`). This file only does the I/O: the requests, the pacing and the
 * files.
 *
 * Usage (pilot defaults are deliberately small: 3 requests, 300 candidates):
 *   npx tsx scripts/crawl-aptoide.ts
 *   npx tsx scripts/crawl-aptoide.ts --max-requests 60 --max-candidates 5000
 *   npx tsx scripts/crawl-aptoide.ts --fresh            # discard the saved crawl and start over
 * Flags: --max-requests N  --max-candidates N  --max-offset N  --limit N (1..100)
 *        --delay-ms N (never below 1000)  --dir PATH  --fresh  --no-geo
 *
 * Files, in `--dir` (default `storage/downloads`):
 *   aptoide-crawl-candidates.jsonl   one candidate per line, append-only
 *   aptoide-crawl-checkpoint.json    where the next run resumes
 *   aptoide-crawl-last-run.json      this run's report (counts, statuses, country)
 * Candidates are appended BEFORE the checkpoint is saved, so a crash between the
 * two only repeats a page, and the repeat is dropped as a duplicate on resume.
 * Run again with the same `--dir` to resume; a finished crawl says so and stops.
 *
 * Politeness (decision 3 of the `5.h.vi.zo` split): one request in flight, at
 * most one per second, an honest User-Agent, no login or cookies, exponential
 * backoff with jitter on 429 and 5xx, `Retry-After` honoured, three 403/429 in a
 * row stops the run (it never retries harder), a hard per-run cap on HTTP
 * requests including retries, and a cap on the bytes read from any one body.
 *
 * Exit code: 0 finished or paused at the request cap; 1 usage error or a refusal
 * to touch existing files; 2 stopped by a block, an unreadable page or a page
 * that did not start where it was asked to.
 *
 * Network note: the session sandbox that wrote this script is denied Aptoide
 * (`host_not_allowed`), so it has never made a request. Run it from the
 * operator's device or a CI runner and read the printed summary first.
 */

import { mkdir, readFile, rename, unlink, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import {
  APTOIDE_LIST_MAX_LIMIT,
  applyPage,
  newCheckpoint,
  normalizeCaps,
  pauseCheckpoint,
  readCandidate,
  readCheckpoint,
  readListPage,
  type CrawlCandidate,
  type CrawlCheckpoint,
} from "../lib/aptoide-crawl";

const API_BASE = "https://ws75.aptoide.com/api/7";
const USER_AGENT = "d-store-crawl/0.1 (+https://github.com/Zapier-codes/D-Store)";
const SORT = "downloads";

const MIN_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_ATTEMPTS_PER_PAGE = 4;
const BACKOFF_BASE_MS = 2000;
const BACKOFF_CAP_MS = 60000;
const RETRY_AFTER_CAP_MS = 120000;
const BLOCK_STRIKES = 3;

import { loadIngestConfig } from "../lib/ingest-config";
const ingestConfig = loadIngestConfig();
const PILOT_MAX_REQUESTS = ingestConfig.crawl.maxRequests;
const PILOT_MAX_CANDIDATES = ingestConfig.crawl.maxCandidates;

const CANDIDATES_FILE = "aptoide-crawl-candidates.jsonl";
const CHECKPOINT_FILE = "aptoide-crawl-checkpoint.json";
const REPORT_FILE = "aptoide-crawl-last-run.json";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

interface Args {
  maxRequests: number;
  maxCandidates: number;
  maxOffset: number | null;
  limit: number;
  delayMs: number;
  dir: string;
  fresh: boolean;
  geo: boolean;
}

class UsageError extends Error {}

function wholeNumber(flag: string, raw: string | undefined, min: number): number {
  const value = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isSafeInteger(value) || value < min) throw new UsageError(`${flag} needs a whole number of at least ${min}, got "${raw ?? ""}".`);
  return value;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    maxRequests: PILOT_MAX_REQUESTS,
    maxCandidates: PILOT_MAX_CANDIDATES,
    maxOffset: null,
    limit: APTOIDE_LIST_MAX_LIMIT,
    delayMs: MIN_DELAY_MS,
    dir: path.join("storage", "downloads"),
    fresh: false,
    geo: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    switch (flag) {
      case "--max-requests":
        args.maxRequests = wholeNumber(flag, argv[++i], 1);
        break;
      case "--max-candidates":
        args.maxCandidates = wholeNumber(flag, argv[++i], 1);
        break;
      case "--max-offset":
        args.maxOffset = wholeNumber(flag, argv[++i], 0);
        break;
      case "--limit":
        args.limit = wholeNumber(flag, argv[++i], 1);
        if (args.limit > APTOIDE_LIST_MAX_LIMIT) throw new UsageError(`--limit is at most ${APTOIDE_LIST_MAX_LIMIT}.`);
        break;
      case "--delay-ms":
        // Only ever slower than the floor, never faster.
        args.delayMs = Math.max(MIN_DELAY_MS, wholeNumber(flag, argv[++i], 0));
        break;
      case "--dir": {
        const value = argv[++i];
        if (!value) throw new UsageError("--dir needs a path.");
        args.dir = value;
        break;
      }
      case "--fresh":
        args.fresh = true;
        break;
      case "--no-geo":
        args.geo = false;
        break;
      default:
        throw new UsageError(`Unknown argument "${flag}". See the header of scripts/crawl-aptoide.ts.`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message: string): void {
  console.log(message);
}

/** `Retry-After` as milliseconds: whole seconds or an HTTP date; anything else is `null`. Capped. */
function parseRetryAfter(header: string | null, nowMs: number): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (trimmed === "") return null;
  let ms: number;
  if (/^\d+$/.test(trimmed)) ms = Number(trimmed) * 1000;
  else {
    const date = Date.parse(trimmed);
    if (Number.isNaN(date)) return null;
    ms = date - nowMs;
  }
  if (!Number.isFinite(ms)) return null;
  return Math.min(Math.max(ms, 0), RETRY_AFTER_CAP_MS);
}

/** Exponential backoff with jitter: attempt 1 waits about 1 to 2 s, then about 2 to 4 s, and so on, capped. */
function backoffMs(attempt: number): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
  return Math.round(ceiling * (0.5 + Math.random() * 0.5));
}

/** The body as text, or `null` when it is larger than `cap` bytes. */
async function readBodyCapped(res: Response, cap: number): Promise<string | null> {
  if (!res.body) {
    const text = await res.text();
    return Buffer.byteLength(text, "utf8") > cap ? null : text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

async function unlinkIfPresent(file: string): Promise<boolean> {
  try {
    await unlink(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readTextIfPresent(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** The runner's country as ipapi.co reports it (the probe recorded the same source), or `null`. Best effort, one short request. */
async function lookupCountry(): Promise<string | null> {
  try {
    const res = await fetch("https://ipapi.co/country/", {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return /^[A-Z]{2}$/.test(text) ? text : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Candidates file
// ---------------------------------------------------------------------------

interface LoadedCandidates {
  seen: Set<string>;
  lines: number;
  unreadableLines: number;
  needsNewline: boolean;
}

async function loadCandidates(file: string): Promise<LoadedCandidates> {
  const text = await readTextIfPresent(file);
  const seen = new Set<string>();
  if (text === null) return { seen, lines: 0, unreadableLines: 0, needsNewline: false };
  let lines = 0;
  let unreadableLines = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let candidate: CrawlCandidate | null = null;
    try {
      candidate = readCandidate(JSON.parse(line));
    } catch {
      candidate = null;
    }
    if (candidate) {
      lines += 1;
      seen.add(candidate.package);
    } else {
      unreadableLines += 1;
    }
  }
  return { seen, lines, unreadableLines, needsNewline: text.length > 0 && !text.endsWith("\n") };
}

// ---------------------------------------------------------------------------
// One page, with politeness
// ---------------------------------------------------------------------------

type PageOutcome =
  | { ok: true; json: unknown }
  | { ok: false; stop: "blocked" | "bad_page"; detail: string };

interface RunState {
  /** HTTP requests made this run, retries included. */
  httpRequests: number;
  /** Consecutive 403/429 answers, across pages; any 200 resets it. */
  blockStrikes: number;
  statusCounts: Record<string, number>;
  lastRequestAt: number;
}

function count(state: RunState, key: string): void {
  state.statusCounts[key] = (state.statusCounts[key] ?? 0) + 1;
}

async function fetchPage(offset: number, limit: number, args: Args, caps: { maxRequests: number }, state: RunState): Promise<PageOutcome> {
  const url = `${API_BASE}/listApps/sort=${SORT}/limit=${limit}/offset=${offset}`;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PAGE; attempt += 1) {
    if (state.httpRequests >= caps.maxRequests) {
      return { ok: false, stop: "bad_page", detail: `the run's request cap (${caps.maxRequests}) was used up while retrying offset ${offset}` };
    }

    // Pacing: at least `delayMs` between the start of one request and the next.
    const wait = state.lastRequestAt + args.delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    state.lastRequestAt = Date.now();
    state.httpRequests += 1;

    let retryAfterMs: number | null = null;
    let failure: string;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      count(state, String(res.status));

      if (res.ok) {
        const body = await readBodyCapped(res, MAX_BODY_BYTES);
        if (body === null) return { ok: false, stop: "bad_page", detail: `the body for offset ${offset} was larger than ${MAX_BODY_BYTES} bytes` };
        state.blockStrikes = 0;
        try {
          return { ok: true, json: JSON.parse(body) };
        } catch {
          return { ok: false, stop: "bad_page", detail: `the body for offset ${offset} was not JSON` };
        }
      }

      await res.body?.cancel().catch(() => undefined);
      if (res.status === 403 || res.status === 429) {
        state.blockStrikes += 1;
        if (state.blockStrikes >= BLOCK_STRIKES) {
          return { ok: false, stop: "blocked", detail: `${state.blockStrikes} answers of 403/429 in a row (last: ${res.status}); stopping, not retrying harder` };
        }
        retryAfterMs = parseRetryAfter(res.headers.get("retry-after"), Date.now());
        failure = `HTTP ${res.status}`;
      } else if (res.status >= 500) {
        retryAfterMs = parseRetryAfter(res.headers.get("retry-after"), Date.now());
        failure = `HTTP ${res.status}`;
      } else {
        // 404 and every other 4xx: retrying will not change the answer.
        return { ok: false, stop: "bad_page", detail: `HTTP ${res.status} for ${url.replace(API_BASE, "")}` };
      }
    } catch (error) {
      count(state, "network");
      failure = `network error (${error instanceof Error ? error.name : "unknown"})`;
    }

    if (attempt === MAX_ATTEMPTS_PER_PAGE) {
      return { ok: false, stop: "bad_page", detail: `${failure} at offset ${offset}; gave up after ${MAX_ATTEMPTS_PER_PAGE} attempts` };
    }
    const delay = Math.max(backoffMs(attempt), retryAfterMs ?? 0);
    log(`  ${failure} at offset ${offset}; attempt ${attempt} of ${MAX_ATTEMPTS_PER_PAGE}, waiting ${Math.round(delay / 100) / 10}s`);
    await sleep(delay);
  }
  return { ok: false, stop: "bad_page", detail: `no answer for offset ${offset}` };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }

  const dir = path.resolve(process.cwd(), args.dir);
  const candidatesPath = path.join(dir, CANDIDATES_FILE);
  const checkpointPath = path.join(dir, CHECKPOINT_FILE);
  const reportPath = path.join(dir, REPORT_FILE);
  await mkdir(dir, { recursive: true });

  if (args.fresh) {
    const removed = [await unlinkIfPresent(candidatesPath), await unlinkIfPresent(checkpointPath)].filter(Boolean).length;
    log(`--fresh: removed ${removed} existing crawl file(s) in ${dir}.`);
  }

  const startedAt = new Date().toISOString();
  const caps = normalizeCaps({ maxRequests: args.maxRequests, maxCandidates: args.maxCandidates, maxOffset: args.maxOffset });

  // Resume or start. An existing file this code cannot read is never overwritten quietly.
  const loaded = await loadCandidates(candidatesPath);
  const savedText = await readTextIfPresent(checkpointPath);
  let cp: CrawlCheckpoint;
  if (savedText === null) {
    if (loaded.lines > 0 || loaded.unreadableLines > 0) {
      console.error(`${CANDIDATES_FILE} exists without ${CHECKPOINT_FILE}. Refusing to guess; pass --fresh to start over.`);
      return 1;
    }
    cp = newCheckpoint({ sort: SORT, limit: args.limit, now: startedAt });
    log(`Starting a new crawl: sort=${cp.sort}, limit=${cp.limit}.`);
  } else {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(savedText);
    } catch {
      parsed = null;
    }
    const existing = readCheckpoint(parsed);
    if (existing === null) {
      console.error(`${CHECKPOINT_FILE} is not a checkpoint this script wrote. Refusing to overwrite it; fix it or pass --fresh.`);
      return 1;
    }
    if (loaded.lines < existing.candidates) {
      console.error(`${CANDIDATES_FILE} has ${loaded.lines} candidates but the checkpoint counts ${existing.candidates}; lines are missing. Refusing to continue; pass --fresh to start over.`);
      return 1;
    }
    cp = existing;
    log(`Resuming: offset ${cp.offset}, ${cp.candidates} candidates so far, ${cp.requests} pages fetched (sort=${cp.sort}, limit=${cp.limit} from the checkpoint).`);
    if (cp.done) {
      log(`This crawl is already finished (${cp.stop_reason}). Pass --fresh to start over.`);
      return 0;
    }
  }
  if (loaded.unreadableLines > 0) log(`Note: ${loaded.unreadableLines} line(s) in ${CANDIDATES_FILE} could not be read and were ignored.`);
  if (loaded.needsNewline) await appendFile(candidatesPath, "\n", "utf8");

  const country = args.geo ? await lookupCountry() : null;
  log(`Runner country (ipapi.co): ${country ?? "not checked or unknown"}.`);
  log(`Caps this run: ${caps.maxRequests} HTTP requests, ${caps.maxCandidates} candidates in total${caps.maxOffset === null ? "" : `, offset up to ${caps.maxOffset}`}; at most 1 request per ${args.delayMs / 1000}s.`);

  let stopping = false;
  process.on("SIGINT", () => {
    if (stopping) process.exit(130);
    stopping = true;
    log("Stopping after the current page (Ctrl-C again to quit now). The checkpoint is saved after every page.");
  });

  const state: RunState = { httpRequests: 0, blockStrikes: 0, statusCounts: {}, lastRequestAt: 0 };
  const seen = loaded.seen;
  const startCandidates = cp.candidates;
  const startPages = cp.requests;
  let previousDownloads: number | null = null;
  let orderViolations = 0;
  let firstPageNote: string | null = null;
  let detail = "";

  while (!cp.done && !stopping) {
    const offsetAsked = cp.offset;
    const outcome = await fetchPage(offsetAsked, cp.limit, args, caps, state);

    if (!outcome.ok) {
      cp = pauseCheckpoint(cp, outcome.stop, new Date().toISOString());
      await writeJsonAtomic(checkpointPath, cp);
      detail = outcome.detail;
      log(`Stopped (${outcome.stop}): ${detail}`);
      break;
    }

    const page = readListPage(outcome.json);
    if (!page.ok) {
      cp = pauseCheckpoint(cp, "bad_page", new Date().toISOString());
      await writeJsonAtomic(checkpointPath, cp);
      detail = `the response at offset ${offsetAsked} was not a listApps page (${page.reason})`;
      log(`Stopped (bad_page): ${detail}`);
      break;
    }

    const step = applyPage(cp, page, caps, new Date().toISOString(), seen, state.httpRequests);

    if (step.accepted.length > 0) {
      await appendFile(candidatesPath, `${step.accepted.map((c) => JSON.stringify(c)).join("\n")}\n`, "utf8");
      for (const candidate of step.accepted) {
        seen.add(candidate.package);
        if (candidate.downloads !== null) {
          if (previousDownloads !== null && candidate.downloads > previousDownloads) orderViolations += 1;
          previousDownloads = candidate.downloads;
        }
      }
    }
    cp = step.checkpoint;
    await writeJsonAtomic(checkpointPath, cp);

    if (cp.requests === startPages + 1) {
      firstPageNote = `first page: asked offset ${offsetAsked}, Aptoide echoed ${page.offset ?? "nothing"}, next ${page.next ?? "none"}, ${page.listLength} items, total ${page.total ?? "unknown"}`;
      log(`  ${firstPageNote}`);
    }
    log(`  offset ${offsetAsked}: ${page.listLength} items, ${step.accepted.length} new, next ${page.next ?? "none"}; ${cp.candidates} candidates so far`);

    if (cp.stop_reason === "request_cap") break;
  }

  // Report.
  const endedAt = new Date().toISOString();
  const report = {
    started_at: startedAt,
    ended_at: endedAt,
    runner_country: country,
    http_requests: state.httpRequests,
    status_counts: state.statusCounts,
    pages_this_run: cp.requests - startPages,
    new_candidates_this_run: cp.candidates - startCandidates,
    candidates_total: cp.candidates,
    skipped_total: cp.skipped,
    duplicates_total: cp.duplicates,
    reported_total: cp.total,
    offset: cp.offset,
    done: cp.done,
    stop_reason: cp.stop_reason,
    stop_detail: detail || null,
    downloads_order_violations: orderViolations,
    first_page: firstPageNote,
    interrupted: stopping,
  };
  await writeJsonAtomic(reportPath, report);

  log("");
  log("Summary");
  log(`  HTTP requests this run: ${state.httpRequests} (statuses: ${Object.keys(state.statusCounts).length === 0 ? "none" : Object.entries(state.statusCounts).map(([k, v]) => `${k}x${v}`).join(", ")})`);
  log(`  Pages this run: ${report.pages_this_run}; new candidates this run: ${report.new_candidates_this_run}; total candidates: ${cp.candidates}`);
  log(`  Skipped items (all runs): ${cp.skipped}; duplicates dropped (all runs): ${cp.duplicates}; Aptoide's reported total: ${cp.total ?? "unknown"}`);
  log(`  Stop: ${cp.stop_reason ?? (stopping ? "interrupted" : "none")}${cp.done ? " (finished)" : " (resumable)"}; next offset ${cp.offset}`);
  log(`  Reported downloads that went UP down the list (expected 0 for sort=downloads): ${orderViolations}`);
  log(`  Runner country: ${country ?? "unknown"}`);
  log(`  Files: ${candidatesPath}, ${checkpointPath}, ${reportPath}`);
  if (cp.stop_reason === "offset_mismatch") {
    log("  !! Aptoide answered a different offset than asked. The sort=downloads/limit/offset path may not behave as assumed; do not run this larger until that is understood.");
  }

  if (cp.stop_reason === "blocked" || cp.stop_reason === "bad_page" || cp.stop_reason === "offset_mismatch") return 2;
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error("crawl failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
