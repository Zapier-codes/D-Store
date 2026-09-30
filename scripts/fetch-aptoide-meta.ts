/**
 * Aptoide per-package meta fetcher — leaf `5.h.x.zi`.
 *
 * Reads `aptoide-crawl-candidates.jsonl`, fetches each package's full metadata
 * via `app/getMeta/package_name=<pkg>`, runs it through the trust gate
 * (`aptoideTrustVerdict` from `lib/sources/aptoide.ts`), and writes the trusted
 * raw responses to `aptoide-meta-results.jsonl`.
 *
 * This script NEVER writes to `aptoide-snapshot.json` — that merge is `5.h.x.zo`.
 *
 * All politeness rules are identical to `scripts/crawl-aptoide.ts`: 1 request/sec,
 * honest User-Agent, exponential backoff with jitter on 429/5xx, honouring
 * `Retry-After`, three 403/429 in a row stops the run, hard per-run request cap,
 * and a cap on the bytes read from any one body.
 *
 * Usage (pilot defaults are small: 50 requests):
 *   npx tsx scripts/fetch-aptoide-meta.ts
 *   npx tsx scripts/fetch-aptoide-meta.ts --max-requests 100 --limit 200
 * Flags: --max-requests N  --limit N (max packages to check)  --dir PATH  --fresh
 *
 * Files, in `--dir` (default `storage/downloads`):
 *   aptoide-crawl-candidates.jsonl   INPUT: one candidate per line
 *   aptoide-meta-results.jsonl       OUTPUT: one verified AptoideRawApp per line
 *   aptoide-meta-checkpoint.json     resumable state (index, counts)
 *   aptoide-meta-last-run.json       this run's report
 *
 * Network note: the session sandbox that wrote this script is denied Aptoide,
 * so it has never made a request. Run it from the operator's device or a CI
 * runner and read the printed summary first.
 */

import { mkdir, readFile, rename, unlink, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { aptoideTrustVerdict, type AptoideRawApp } from "../lib/sources/aptoide";

const API_BASE = "https://ws75.aptoide.com/api/7";
const USER_AGENT = "d-store-fetch-meta/0.1 (+https://github.com/Zapier-codes/D-Store)";

const MIN_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 2000;
const BACKOFF_CAP_MS = 60000;
const RETRY_AFTER_CAP_MS = 120000;
const BLOCK_STRIKES = 3;

import { loadIngestConfig } from "../lib/ingest-config";
const ingestConfig = loadIngestConfig();
const PILOT_MAX_REQUESTS = ingestConfig.fetch.maxRequests;

const CANDIDATES_FILE = "aptoide-crawl-candidates.jsonl";
const RESULTS_FILE = "aptoide-meta-results.jsonl";
const CHECKPOINT_FILE = "aptoide-meta-checkpoint.json";
const REPORT_FILE = "aptoide-meta-last-run.json";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

interface Args {
  maxRequests: number;
  limit: number | null;
  dir: string;
  fresh: boolean;
}

class UsageError extends Error {}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    maxRequests: PILOT_MAX_REQUESTS,
    limit: null,
    dir: path.join("storage", "downloads"),
    fresh: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    switch (flag) {
      case "--max-requests": {
        const value = Number(argv[++i]);
        if (!Number.isSafeInteger(value) || value < 1) throw new UsageError(`--max-requests needs a whole number >= 1, got "${argv[i] ?? ""}".`);
        args.maxRequests = value;
        break;
      }
      case "--limit": {
        const value = Number(argv[++i]);
        if (!Number.isSafeInteger(value) || value < 1) throw new UsageError(`--limit needs a whole number >= 1, got "${argv[i] ?? ""}".`);
        args.limit = value;
        break;
      }
      case "--dir": {
        const value = argv[++i];
        if (!value) throw new UsageError("--dir needs a path.");
        args.dir = value;
        break;
      }
      case "--fresh":
        args.fresh = true;
        break;
      default:
        throw new UsageError(`Unknown argument "${flag}". See the header of scripts/fetch-aptoide-meta.ts.`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Small helpers (copied from crawl-aptoide.ts for consistency)
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message: string): void {
  console.log(message);
}

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

function backoffMs(attempt: number): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
  return Math.round(ceiling * (0.5 + Math.random() * 0.5));
}

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

// ---------------------------------------------------------------------------
// Checkpoint
// ---------------------------------------------------------------------------

interface MetaCheckpoint {
  index: number; // The next line to process in the candidates file
  accepted: number;
  rejected: number;
  failed: number;
  done: boolean;
  stop_reason: string | null;
}

function newCheckpoint(): MetaCheckpoint {
  return { index: 0, accepted: 0, rejected: 0, failed: 0, done: false, stop_reason: null };
}

async function readMetaCheckpoint(file: string): Promise<MetaCheckpoint | null> {
  try {
    const text = await readFile(file, "utf8");
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;
    // Basic shape check
    if (typeof parsed.index !== "number" || typeof parsed.accepted !== "number" || typeof parsed.rejected !== "number" || typeof parsed.failed !== "number" || typeof parsed.done !== "boolean") {
      return null;
    }
    return parsed as MetaCheckpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null; // Unreadable, treat as null so caller refuses to overwrite
  }
}

// ---------------------------------------------------------------------------
// One fetch, with politeness
// ---------------------------------------------------------------------------

type FetchOutcome =
  | { ok: true; raw: AptoideRawApp | null } // null means 404 or valid JSON with no app data
  | { ok: false; stop: "blocked" | "bad_app"; detail: string };

interface RunState {
  httpRequests: number;
  blockStrikes: number;
  statusCounts: Record<string, number>;
  lastRequestAt: number;
}

function count(state: RunState, key: string): void {
  state.statusCounts[key] = (state.statusCounts[key] ?? 0) + 1;
}

async function fetchMeta(pkg: string, args: Args, caps: { maxRequests: number }, state: RunState): Promise<FetchOutcome> {
  const url = `${API_BASE}/app/getMeta/package_name=${encodeURIComponent(pkg)}`;
  
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (state.httpRequests >= caps.maxRequests) {
      return { ok: false, stop: "bad_app", detail: `request cap (${caps.maxRequests}) reached` };
    }

    const wait = state.lastRequestAt + MIN_DELAY_MS - Date.now();
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
        if (body === null) return { ok: false, stop: "bad_app", detail: `body for ${pkg} > ${MAX_BODY_BYTES} bytes` };
        state.blockStrikes = 0;
        try {
          const json = JSON.parse(body);
          // Aptoide wraps data in nodes.meta.data
          const raw = (json?.nodes?.meta?.data ?? null) as AptoideRawApp | null;
          return { ok: true, raw };
        } catch {
          return { ok: false, stop: "bad_app", detail: `body for ${pkg} was not JSON` };
        }
      }

      await res.body?.cancel().catch(() => undefined);
      
      if (res.status === 404) {
        // App doesn't exist, not a retryable error
        state.blockStrikes = 0; // 404 doesn't indicate a block
        return { ok: true, raw: null }; 
      }
      
      if (res.status === 403 || res.status === 429) {
        state.blockStrikes += 1;
        if (state.blockStrikes >= BLOCK_STRIKES) {
          return { ok: false, stop: "blocked", detail: `${state.blockStrikes} answers of 403/429 in a row` };
        }
        retryAfterMs = parseRetryAfter(res.headers.get("retry-after"), Date.now());
        failure = `HTTP ${res.status}`;
      } else if (res.status >= 500) {
        retryAfterMs = parseRetryAfter(res.headers.get("retry-after"), Date.now());
        failure = `HTTP ${res.status}`;
      } else {
        // Other 4xx: retrying won't help
        return { ok: false, stop: "bad_app", detail: `HTTP ${res.status} for ${pkg}` };
      }
    } catch (error) {
      count(state, "network");
      failure = `network error (${error instanceof Error ? error.name : "unknown"})`;
    }

    if (attempt === MAX_ATTEMPTS) {
      return { ok: false, stop: "bad_app", detail: `${failure} for ${pkg}; gave up after ${MAX_ATTEMPTS} attempts` };
    }
    
    const delay = Math.max(backoffMs(attempt), retryAfterMs ?? 0);
    log(`  ${failure} for ${pkg}; attempt ${attempt} of ${MAX_ATTEMPTS}, waiting ${Math.round(delay / 100) / 10}s`);
    await sleep(delay);
  }
  
  return { ok: false, stop: "bad_app", detail: `no answer for ${pkg}` };
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
  const resultsPath = path.join(dir, RESULTS_FILE);
  const checkpointPath = path.join(dir, CHECKPOINT_FILE);
  const reportPath = path.join(dir, REPORT_FILE);
  await mkdir(dir, { recursive: true });

  if (args.fresh) {
    const removed = [await unlinkIfPresent(resultsPath), await unlinkIfPresent(checkpointPath)].filter(Boolean).length;
    log(`--fresh: removed ${removed} existing meta file(s) in ${dir}.`);
  }

  // Load candidates
  let candidatesText: string;
  try {
    candidatesText = await readFile(candidatesPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`${CANDIDATES_FILE} not found in ${dir}. Run scripts/crawl-aptoide.ts first.`);
      return 1;
    }
    throw error;
  }

  const lines = candidatesText.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    console.error(`${CANDIDATES_FILE} is empty. Nothing to fetch.`);
    return 1;
  }

  const limit = args.limit === null ? lines.length : Math.min(args.limit, lines.length);
  
  // Resume or start
  let cp = await readMetaCheckpoint(checkpointPath);
  if (cp === null) {
    // Check if results file exists without a checkpoint to avoid overwriting
    try {
      await readFile(resultsPath, "utf8");
      console.error(`${RESULTS_FILE} exists without ${CHECKPOINT_FILE}. Refusing to guess; pass --fresh to start over.`);
      return 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    cp = newCheckpoint();
    log(`Starting a new meta fetch. Target: up to ${limit} packages.`);
  } else {
    log(`Resuming: ${cp.index} processed, ${cp.accepted} accepted, ${cp.rejected} rejected, ${cp.failed} failed so far.`);
    if (cp.done) {
      log(`This run is already finished (${cp.stop_reason}). Pass --fresh to start over.`);
      return 0;
    }
  }

  const state: RunState = { httpRequests: 0, blockStrikes: 0, statusCounts: {}, lastRequestAt: 0 };
  let stopping = false;
  process.on("SIGINT", () => {
    if (stopping) process.exit(130);
    stopping = true;
    log("Stopping after the current package (Ctrl-C again to quit now).");
  });

  const caps = { maxRequests: args.maxRequests };

  for (let i = cp.index; i < limit; i += 1) {
    if (stopping || state.httpRequests >= caps.maxRequests) {
      cp.stop_reason = state.httpRequests >= caps.maxRequests ? "request_cap" : "interrupted";
      cp.done = false;
      await writeJsonAtomic(checkpointPath, cp);
      log(`Paused at index ${i}.`);
      break;
    }

    let pkg = "unknown";
    try {
      const candidate = JSON.parse(lines[i]);
      pkg = candidate.package;
    } catch {
      log(`Skipping malformed line ${i + 1}`);
      cp.failed += 1;
      cp.index = i + 1;
      continue;
    }

    if (!pkg || typeof pkg !== "string") {
      log(`Skipping line ${i + 1}: no valid package name`);
      cp.failed += 1;
      cp.index = i + 1;
      continue;
    }

    const outcome = await fetchMeta(pkg, args, caps, state);

    if (!outcome.ok) {
      cp.stop_reason = outcome.stop;
      cp.done = outcome.stop === "blocked"; // Only block is considered "done" (terminal for this run)
      cp.index = i; // Try this package again next run
      await writeJsonAtomic(checkpointPath, cp);
      log(`Stopped (${outcome.stop}): ${outcome.detail}`);
      break;
    }

    const raw = outcome.raw;
    if (raw === null) {
      log(`  ${i + 1}/${limit}: ${pkg} - 404 / not found`);
      cp.rejected += 1;
    } else {
      const verdict = aptoideTrustVerdict(raw);
      if (verdict.trusted) {
        log(`  ${i + 1}/${limit}: ${pkg} - TRUSTED`);
        await appendFile(resultsPath, `${JSON.stringify(raw)}\n`, "utf8");
        cp.accepted += 1;
      } else {
        log(`  ${i + 1}/${limit}: ${pkg} - REJECTED (${verdict.reason})`);
        cp.rejected += 1;
      }
    }
    
    cp.index = i + 1;
    await writeJsonAtomic(checkpointPath, cp);
  }

  if (cp.index >= limit && !stopping && state.httpRequests < caps.maxRequests) {
    cp.done = true;
    cp.stop_reason = "target_reached";
    await writeJsonAtomic(checkpointPath, cp);
  }

  const report = {
    started_at: new Date().toISOString(), // Approx, since we didn't track exact start
    index: cp.index,
    accepted: cp.accepted,
    rejected: cp.rejected,
    failed: cp.failed,
    http_requests: state.httpRequests,
    status_counts: state.statusCounts,
    done: cp.done,
    stop_reason: cp.stop_reason,
  };
  await writeJsonAtomic(reportPath, report);

  log("");
  log("Summary");
  log(`  Packages processed: ${cp.index}`);
  log(`  Accepted (TRUSTED): ${cp.accepted}`);
  log(`  Rejected (untrusted/missing): ${cp.rejected}`);
  log(`  Failed (network/parse errors): ${cp.failed}`);
  log(`  HTTP requests: ${state.httpRequests} (statuses: ${Object.keys(state.statusCounts).length === 0 ? "none" : Object.entries(state.statusCounts).map(([k, v]) => `${k}x${v}`).join(", ")})`);
  log(`  Stop: ${cp.stop_reason ?? "none"}${cp.done ? " (finished)" : " (resumable)"}`);
  log(`  Files: ${resultsPath}, ${checkpointPath}, ${reportPath}`);

  if (cp.stop_reason === "blocked") return 2;
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error("fetch failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
