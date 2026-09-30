/**
 * Aptoide list crawl — the pure half. Leaf `5.h.ix.zi`.
 *
 * Reads ONE `listApps` page into crawl candidates, decides where the next page
 * is (Aptoide's own cursor, `datalist.next`), enforces the caps, and defines the
 * checkpoint a resumable run keeps. Nothing here touches the network, the
 * clock, the file system or `process`: the runner (`5.h.ix.zo`) does the I/O and
 * passes the time in. Nothing runs at import. Every function takes untrusted
 * input where the input is a response or a saved file, and none of them throws.
 *
 * What this file relies on, from the probe records under `5.h.vi.zi` (two runs
 * from one device, country NG, 2026-09-30):
 *   - `listApps/...` answers `{ datalist: { total, count, offset, limit, next,
 *     hidden, list: [...] } }`; each list item carries `package`, `name`,
 *     `updated`, and `stats.downloads` (a reported figure, round buckets).
 *   - Page size tops out at 100. `next` is Aptoide's own cursor and is NOT
 *     `offset + limit` (it skips entries Aptoide filters out), so the crawl
 *     follows `next` and never adds `limit`.
 *   - List items carry no `file.malware`: a candidate is only a name to look up
 *     with `app/getMeta` (`5.h.x.zi`); nothing here says an app is trusted.
 *
 * Not settled by the probes, and left to the runner to observe rather than
 * assumed here: whether `sort=downloads` combines with `offset` in one path,
 * whether paging has a depth cap beyond offset 100000 (`maxOffset` exists for
 * that), and whether `next` is ever sent as a string (it is read as a number
 * only; a string reads as "no cursor" and the crawl stops, which fails safe).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Aptoide returned at most 100 items for `limit=200`; 100 is the page size to ask for. */
export const APTOIDE_LIST_MAX_LIMIT = 100;

/** Sanity bound on how many items of one page are read; a page claiming more is cut, and the rest are counted as skipped. */
export const MAX_ITEMS_READ_PER_PAGE = 200;

/** Longest package name kept. Android's own limit is well under this; it exists so a hostile value cannot bloat a file or a URL. */
export const MAX_PACKAGE_LENGTH = 255;

/** Longest name kept; a longer one is cut, not rejected. */
export const MAX_NAME_LENGTH = 200;

/** Longest `updated` string kept (Aptoide's format is `YYYY-MM-DD HH:MM:SS`, 19 characters). */
export const MAX_UPDATED_LENGTH = 40;

export const CHECKPOINT_VERSION = 1;

/**
 * Why a crawl stopped. The first group ends the crawl for good (`done: true`).
 * `request_cap`, `blocked` and `bad_page` only pause it: a later run resumes from
 * the saved offset (`done: false`).
 */
export const TERMINAL_REASONS = [
  "target_reached",
  "empty_page",
  "no_cursor",
  "cursor_stalled",
  "end_of_list",
  "depth_cap",
  "offset_mismatch",
] as const;
export const PAUSED_REASONS = ["request_cap", "blocked", "bad_page"] as const;

export type TerminalReason = (typeof TERMINAL_REASONS)[number];
export type PausedReason = (typeof PAUSED_REASONS)[number];
export type StopReason = TerminalReason | PausedReason;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One app to look up later. Everything but `package` is optional information; a null is "not usable in the response". */
export interface CrawlCandidate {
  package: string;
  name: string | null;
  /** Aptoide's own `updated` string, kept verbatim so a refresh can compare it for equality. */
  updated: string | null;
  /** Aptoide's reported download figure (a bucket, not a measurement). */
  downloads: number | null;
}

export interface ListPage {
  ok: true;
  candidates: CrawlCandidate[];
  /** Items that were not a usable candidate (not an object, or no valid `package`), plus any beyond `MAX_ITEMS_READ_PER_PAGE`. */
  skipped: number;
  /** Length of the page's `list` as received, before any filtering. */
  listLength: number;
  total: number | null;
  /** The offset Aptoide says this page starts at (`datalist.offset`); `null` when it does not say. */
  offset: number | null;
  /** Aptoide's cursor for the next page; `null` when absent or not a non-negative whole number. */
  next: number | null;
}

export type ListPageFailure = "not_an_object" | "no_datalist" | "no_list" | "unreadable";
export type ListPageResult = ListPage | { ok: false; reason: ListPageFailure };

export interface CrawlCaps {
  /** Requests allowed in ONE run (the "hard per-run request cap"). Reaching it pauses the crawl. */
  maxRequests: number;
  /** Unique candidates to collect in total (decision 2: the first run targets the top 5,000). Reaching it ends the crawl. */
  maxCandidates: number;
  /** Do not follow a cursor beyond this offset; `null` for no limit. */
  maxOffset: number | null;
}

/** Defaults: 5,000 candidates is 50 pages of 100; 60 requests leaves slack. Editable settings arrive with `5.h.xi.zi`. */
export const DEFAULT_CAPS: CrawlCaps = { maxRequests: 60, maxCandidates: 5000, maxOffset: null };

export interface CrawlCheckpoint {
  version: typeof CHECKPOINT_VERSION;
  sort: string;
  limit: number;
  /** The offset the NEXT request should use. */
  offset: number;
  /** Requests made across every run so far. */
  requests: number;
  /** Unique candidates accepted across every run so far. */
  candidates: number;
  /** Items skipped as unusable, across every run. */
  skipped: number;
  /** Candidates dropped because the package was already collected. */
  duplicates: number;
  /** Aptoide's latest `datalist.total`, kept for the run report only. */
  total: number | null;
  started_at: string;
  updated_at: string;
  done: boolean;
  stop_reason: StopReason | null;
}

// ---------------------------------------------------------------------------
// Small guards
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** A non-negative whole number, else `null`. Numeric strings are NOT accepted: the probes only ever saw numbers. */
function readCount(value: unknown): number | null {
  return isCount(value) ? value : null;
}

const PACKAGE_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

/** A package name that is safe to put in a URL path and a file: letters, digits, `_`, `.`, `-`, starting alphanumeric, at most 255 characters. */
export function isUsablePackage(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_PACKAGE_LENGTH && PACKAGE_PATTERN.test(value);
}

function readName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, MAX_NAME_LENGTH);
}

function readUpdated(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" || trimmed.length > MAX_UPDATED_LENGTH ? null : trimmed;
}

function readDownloads(item: Record<string, unknown>): number | null {
  const stats = item.stats;
  return isRecord(stats) ? readCount(stats.downloads) : null;
}

// ---------------------------------------------------------------------------
// Reading one page
// ---------------------------------------------------------------------------

/** One list item as a candidate, or `null` when it has no usable `package`. Never throws. */
export function readCandidate(item: unknown): CrawlCandidate | null {
  try {
    if (!isRecord(item) || !isUsablePackage(item.package)) return null;
    return {
      package: item.package,
      name: readName(item.name),
      updated: readUpdated(item.updated),
      downloads: readDownloads(item),
    };
  } catch {
    return null;
  }
}

/**
 * Reads one parsed `listApps` response. A response that is not the expected
 * envelope is `{ ok: false }` with a reason, never a silent empty page: the
 * runner must be able to tell "Aptoide sent nothing" from "Aptoide sent
 * something this code does not understand". Item order is kept. Never throws,
 * including on objects whose properties throw when read.
 */
export function readListPage(json: unknown): ListPageResult {
  try {
    if (!isRecord(json)) return { ok: false, reason: "not_an_object" };
    const datalist = json.datalist;
    if (!isRecord(datalist)) return { ok: false, reason: "no_datalist" };
    const list = datalist.list;
    if (!Array.isArray(list)) return { ok: false, reason: "no_list" };

    const candidates: CrawlCandidate[] = [];
    let skipped = 0;
    const readable = Math.min(list.length, MAX_ITEMS_READ_PER_PAGE);
    for (let i = 0; i < readable; i += 1) {
      const candidate = readCandidate(list[i]);
      if (candidate) candidates.push(candidate);
      else skipped += 1;
    }
    skipped += list.length - readable;

    return {
      ok: true,
      candidates,
      skipped,
      listLength: list.length,
      total: readCount(datalist.total),
      offset: readCount(datalist.offset),
      next: readCount(datalist.next),
    };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

/** The candidates in `incoming` that are not in `seen`, first occurrence wins, order kept. Does not modify `seen`. */
export function dedupeCandidates(incoming: readonly CrawlCandidate[], seen: ReadonlySet<string>): CrawlCandidate[] {
  const fresh: CrawlCandidate[] = [];
  const inThisPage = new Set<string>();
  for (const candidate of incoming) {
    if (seen.has(candidate.package) || inThisPage.has(candidate.package)) continue;
    inThisPage.add(candidate.package);
    fresh.push(candidate);
  }
  return fresh;
}

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

/** Caps from anything: a field that is missing or not a sensible number takes its default, so a bad settings file cannot make a run unbounded. */
export function normalizeCaps(input: unknown): CrawlCaps {
  const raw = isRecord(input) ? input : {};
  const positive = (value: unknown, fallback: number): number =>
    isCount(value) && value >= 1 ? value : fallback;
  return {
    maxRequests: positive(raw.maxRequests, DEFAULT_CAPS.maxRequests),
    maxCandidates: positive(raw.maxCandidates, DEFAULT_CAPS.maxCandidates),
    maxOffset: isCount(raw.maxOffset) ? raw.maxOffset : null,
  };
}

// ---------------------------------------------------------------------------
// Checkpoint
// ---------------------------------------------------------------------------

/** A fresh checkpoint at offset 0. `limit` is clamped to 1..100; `now` is an ISO string supplied by the caller. */
export function newCheckpoint(options: { sort: string; limit: number; now: string; offset?: number }): CrawlCheckpoint {
  const limit = isCount(options.limit) ? Math.min(Math.max(options.limit, 1), APTOIDE_LIST_MAX_LIMIT) : APTOIDE_LIST_MAX_LIMIT;
  return {
    version: CHECKPOINT_VERSION,
    sort: options.sort,
    limit,
    offset: isCount(options.offset) ? options.offset : 0,
    requests: 0,
    candidates: 0,
    skipped: 0,
    duplicates: 0,
    total: null,
    started_at: options.now,
    updated_at: options.now,
    done: false,
    stop_reason: null,
  };
}

const TERMINAL_SET: ReadonlySet<string> = new Set(TERMINAL_REASONS);
const PAUSED_SET: ReadonlySet<string> = new Set(PAUSED_REASONS);

function isTerminalReason(value: unknown): value is TerminalReason {
  return typeof value === "string" && TERMINAL_SET.has(value);
}

function isPausedReason(value: unknown): value is PausedReason {
  return typeof value === "string" && PAUSED_SET.has(value);
}

/**
 * A checkpoint read back from a file, or `null` when it is not one this code
 * wrote: wrong version, a wrong-typed or out-of-range field, or a `done` flag
 * that disagrees with the stop reason. The caller decides what `null` means
 * (start fresh, or refuse); this never repairs a file quietly. Never throws.
 */
export function readCheckpoint(json: unknown): CrawlCheckpoint | null {
  try {
    if (!isRecord(json) || json.version !== CHECKPOINT_VERSION) return null;
    const { sort, limit, offset, requests, candidates, skipped, duplicates, total, started_at, updated_at, done, stop_reason } = json;
    if (typeof sort !== "string" || sort === "") return null;
    if (!isCount(limit) || limit < 1 || limit > APTOIDE_LIST_MAX_LIMIT) return null;
    if (!isCount(offset) || !isCount(requests) || !isCount(candidates) || !isCount(skipped) || !isCount(duplicates)) return null;
    if (total !== null && !isCount(total)) return null;
    if (typeof started_at !== "string" || typeof updated_at !== "string") return null;
    if (typeof done !== "boolean") return null;
    let reason: StopReason | null = null;
    if (stop_reason !== null) {
      if (done ? !isTerminalReason(stop_reason) : !isPausedReason(stop_reason)) return null;
      reason = stop_reason as StopReason;
    } else if (done) {
      return null;
    }
    return { version: CHECKPOINT_VERSION, sort, limit, offset, requests, candidates, skipped, duplicates, total, started_at, updated_at, done, stop_reason: reason };
  } catch {
    return null;
  }
}

/**
 * Records a stop the runner decided on itself (`blocked`: three 403/429 in a row;
 * `bad_page`: a response `readListPage` refused). Both pause the crawl and keep
 * the offset, so a later run retries the same page. A finished checkpoint is
 * returned unchanged.
 */
export function pauseCheckpoint(cp: CrawlCheckpoint, reason: "blocked" | "bad_page", now: string): CrawlCheckpoint {
  if (cp.done) return cp;
  return { ...cp, stop_reason: reason, updated_at: now };
}

export interface ApplyResult {
  checkpoint: CrawlCheckpoint;
  /** The new candidates to append to the candidates file. Empty when the page was not accepted. */
  accepted: CrawlCandidate[];
}

/**
 * Takes the page fetched at `cp.offset` and returns the next checkpoint and the
 * candidates to keep. `seen` is every package already collected (the runner
 * builds it from the candidates file); `runRequests` is the number of requests
 * made in THIS run including the one that produced `page`.
 *
 * Checks, in this order, the first that applies decides:
 *   1. the page says it starts somewhere other than where it was asked to
 *      (`offset_mismatch`; the page is not accepted);
 *   2. the candidate target is met (`target_reached`; over-target candidates are dropped);
 *   3. the page had no items (`empty_page`);
 *   4. no cursor (`no_cursor`);
 *   5. the cursor does not advance past the offset just requested (`cursor_stalled`);
 *   6. the cursor is at or past `total` (`end_of_list`);
 *   7. the cursor is past `maxOffset` (`depth_cap`);
 *   8. this run's request cap is used up (`request_cap`, a pause: the offset is the cursor, so a later run resumes);
 *   otherwise continue at the cursor.
 * A checkpoint that is already `done` is returned unchanged with nothing accepted.
 * Never throws.
 */
export function applyPage(
  cp: CrawlCheckpoint,
  page: ListPage,
  caps: CrawlCaps,
  now: string,
  seen: ReadonlySet<string>,
  runRequests: number,
): ApplyResult {
  if (cp.done) return { checkpoint: cp, accepted: [] };

  const requests = cp.requests + 1;
  const total = page.total ?? cp.total;
  const base = { ...cp, requests, total, updated_at: now };

  if (page.offset !== null && page.offset !== cp.offset) {
    return {
      checkpoint: { ...base, skipped: cp.skipped + page.skipped, done: true, stop_reason: "offset_mismatch" },
      accepted: [],
    };
  }

  const fresh = dedupeCandidates(page.candidates, seen);
  const room = Math.max(0, caps.maxCandidates - cp.candidates);
  const accepted = fresh.slice(0, room);
  const counted = {
    ...base,
    candidates: cp.candidates + accepted.length,
    skipped: cp.skipped + page.skipped,
    duplicates: cp.duplicates + (page.candidates.length - fresh.length),
  };

  const stop = (reason: TerminalReason): ApplyResult => ({
    checkpoint: { ...counted, done: true, stop_reason: reason },
    accepted,
  });

  if (counted.candidates >= caps.maxCandidates) return stop("target_reached");
  if (page.listLength === 0) return stop("empty_page");
  if (page.next === null) return stop("no_cursor");
  if (page.next <= cp.offset) return stop("cursor_stalled");
  if (total !== null && page.next >= total) return stop("end_of_list");
  if (caps.maxOffset !== null && page.next > caps.maxOffset) return stop("depth_cap");

  const moved = { ...counted, offset: page.next };
  if (runRequests >= caps.maxRequests) {
    return { checkpoint: { ...moved, done: false, stop_reason: "request_cap" }, accepted };
  }
  return { checkpoint: { ...moved, done: false, stop_reason: null }, accepted };
}
