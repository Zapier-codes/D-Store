/**
 * Aptoide snapshot: merge rules, size limit, shards and header — leaf `5.h.x.zo`.
 *
 * PURE: no imports, no filesystem, no clock, nothing runs at import. The
 * network-free script `scripts/merge-aptoide-snapshot.ts` does the I/O and
 * `lib/aptoide-snapshot-io.ts` writes the files; the storefront's loader
 * (`lib/sources/aptoide.ts`) calls `loadSnapshotFrom` with its own reader.
 *
 * Decisions recorded by this leaf (see its Done note in HANDOVER.md):
 *
 *  1. LIMIT. One snapshot file holds at most `SNAPSHOT_SHARD_LIMIT_BYTES`
 *     (8 MiB) of UTF-8. At about 9.6 KB per app in this one-app-per-line form
 *     that is roughly 870 apps per file. The limit keeps every file small
 *     enough to review in a pull request and far below GitHub's file-size
 *     warnings. It does NOT shrink what a serverless function ships or parses:
 *     the loader still reads every shard into memory.
 *  2. SHARDS. Shard 0 keeps the name `aptoide-snapshot.json`, so a snapshot
 *     that fits in one file is exactly the bare JSON array the loader and the
 *     committed file have always been. Shard n (n >= 1) is
 *     `aptoide-snapshot.<n+1>.json`. Apps are assigned in order, filling each
 *     shard before opening the next, so a shard's content does not change when
 *     a later shard grows.
 *  3. HEADER. `aptoide-snapshot.meta.json` is a sibling file, not part of the
 *     array, so the bare-array format is untouched. It records the run time,
 *     the app count, the runner country, the limit, and each shard's name,
 *     count and size. A missing header is valid (the committed 12-app file has
 *     none): the loader then reads shard 0 alone.
 *  4. REFRESH. An existing app is replaced only when the incoming copy is
 *     strictly newer on a field both carry: `updated` first, `modified` if
 *     neither side has a usable `updated`. Equal means unchanged; older means
 *     stale and is ignored. Timestamps are compared as parsed instants, never
 *     as strings.
 */

export const SNAPSHOT_FILE = "aptoide-snapshot.json";
export const SNAPSHOT_META_FILE = "aptoide-snapshot.meta.json";
export const SNAPSHOT_SHARD_LIMIT_BYTES = 8 * 1024 * 1024;
export const SNAPSHOT_SCHEMA_VERSION = 1;
/** A header listing more shards than this is refused (a corrupt header must not make the loader read without bound). */
export const MAX_SHARDS = 64;
/** The longest package name accepted. Android's own limit is far lower; this only bounds hostile input. */
export const MAX_PACKAGE_LENGTH = 200;

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// --- shard names ----------------------------------------------------------

/** The file name of shard `index` (0-based). Shard 0 is the legacy name. */
export function shardFileName(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_SHARDS) throw new RangeError(`shard index out of range: ${index}`);
  return index === 0 ? SNAPSHOT_FILE : `aptoide-snapshot.${index + 1}.json`;
}

const SHARD_NAME = /^aptoide-snapshot(?:\.(\d{1,3}))?\.json$/;

/** True only for a name `shardFileName` can produce. Exact match: no path separators, no case folding. */
export function isShardFileName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  const m = SHARD_NAME.exec(name);
  if (!m) return false;
  if (m[1] === undefined) return true;
  const n = Number(m[1]);
  return n >= 2 && n <= MAX_SHARDS && String(n) === m[1];
}

/** The 0-based index a shard file name stands for, or `null` when it is not a shard name. */
export function shardIndexOf(name: unknown): number | null {
  if (!isShardFileName(name)) return null;
  const m = SHARD_NAME.exec(name);
  return m && m[1] !== undefined ? Number(m[1]) - 1 : 0;
}

// --- timestamps -----------------------------------------------------------

const AP_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/;

/**
 * Milliseconds since the epoch for an Aptoide timestamp (`YYYY-MM-DD HH:MM:SS`,
 * which carries no zone and is read as UTC, consistently on both sides of every
 * comparison) or an ISO string with a zone. `null` for anything else.
 */
export function parseStamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  const m = AP_TIME.exec(s);
  if (m) {
    const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
    const t = Date.UTC(y, mo - 1, d, h, mi, se);
    const back = new Date(t);
    // Reject a date that rolled over (31 February).
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    return t;
  }
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

// --- validation and refresh ----------------------------------------------

export type InvalidReason = "not_an_object" | "no_package" | "bad_filesize";

/** `null` when the app may be merged; otherwise why not. Never throws. */
export function invalidReason(app: unknown): InvalidReason | null {
  if (!isRecord(app)) return "not_an_object";
  const pkg = app.package;
  if (typeof pkg !== "string" || pkg.trim() === "" || pkg !== pkg.trim() || pkg.length > MAX_PACKAGE_LENGTH) return "no_package";
  const file = app.file;
  const size = isRecord(file) ? file.filesize : undefined;
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return "bad_filesize";
  return null;
}

export type RefreshDecision = "refresh" | "unchanged" | "stale" | "incomparable";

/**
 * Whether `incoming` should replace `existing` (same package assumed).
 * `refresh` only on a strictly newer stamp on a common field; `unchanged` for
 * an equal one; `stale` for an older one; `incomparable` when no field is
 * usable on both sides and nothing says the incoming copy is newer.
 */
export function refreshDecision(existing: unknown, incoming: unknown): RefreshDecision {
  const e = isRecord(existing) ? existing : {};
  const i = isRecord(incoming) ? incoming : {};
  for (const field of ["updated", "modified"] as const) {
    const a = parseStamp(e[field]);
    const b = parseStamp(i[field]);
    if (a !== null && b !== null) return b > a ? "refresh" : b === a ? "unchanged" : "stale";
  }
  const hasAny = (r: Rec) => parseStamp(r.updated) !== null || parseStamp(r.modified) !== null;
  // The incoming copy carries a stamp and the stored one carries none: the stored one can only be older or unknown.
  if (hasAny(i) && !hasAny(e)) return "refresh";
  return "incomparable";
}

export interface MergeCounts {
  added: number;
  refreshed: number;
  unchanged: number;
  stale: number;
  incomparable: number;
  invalid: number;
  /** Incoming entries whose package had already appeared earlier in the same incoming batch. */
  duplicates_in_batch: number;
  /** Stored entries dropped because they had no usable package (they could not be matched or shown). */
  existing_dropped: number;
}

export interface MergeResult {
  apps: Rec[];
  counts: MergeCounts;
  /** At most 50 entries, for the report; the counts are exact. */
  invalid: { package: string | null; reason: InvalidReason }[];
}

/**
 * Merge `incoming` into `existing`, by package. Order is stable: a stored app
 * keeps its position (a refresh replaces it in place), new apps are appended in
 * the order they first appear. Inputs are not mutated. A refreshed app is the
 * incoming copy as given, so anything attached only to the old copy (for
 * example `versions` from `fetch-aptoide-versions.ts`) is dropped with it: a
 * history that lacks the app's current version would be wrong.
 */
export function mergeSnapshot(existing: readonly unknown[], incoming: readonly unknown[]): MergeResult {
  const counts: MergeCounts = { added: 0, refreshed: 0, unchanged: 0, stale: 0, incomparable: 0, invalid: 0, duplicates_in_batch: 0, existing_dropped: 0 };
  const invalid: MergeResult["invalid"] = [];
  const byPackage = new Map<string, Rec>();

  for (const app of Array.isArray(existing) ? existing : []) {
    if (!isRecord(app) || typeof app.package !== "string" || app.package.trim() === "") {
      counts.existing_dropped += 1;
      continue;
    }
    if (byPackage.has(app.package)) {
      // A duplicate already in the stored file: keep the newer one, in the first one's position.
      const d = refreshDecision(byPackage.get(app.package), app);
      if (d === "refresh") byPackage.set(app.package, app);
      counts.existing_dropped += 1;
      continue;
    }
    byPackage.set(app.package, app);
  }

  const seenIncoming = new Set<string>();
  for (const app of Array.isArray(incoming) ? incoming : []) {
    const why = invalidReason(app);
    if (why) {
      counts.invalid += 1;
      if (invalid.length < 50) invalid.push({ package: isRecord(app) && typeof app.package === "string" ? app.package.slice(0, MAX_PACKAGE_LENGTH) : null, reason: why });
      continue;
    }
    const a = app as Rec;
    const pkg = a.package as string;
    if (seenIncoming.has(pkg)) counts.duplicates_in_batch += 1;
    seenIncoming.add(pkg);

    const current = byPackage.get(pkg);
    if (!current) {
      byPackage.set(pkg, a);
      counts.added += 1;
      continue;
    }
    const d = refreshDecision(current, a);
    if (d === "refresh") {
      byPackage.set(pkg, a);
      counts.refreshed += 1;
    } else counts[d] += 1;
  }

  return { apps: Array.from(byPackage.values()), counts, invalid };
}

// --- sharding -------------------------------------------------------------

const encoder = new TextEncoder();

/** UTF-8 byte length. */
export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/** One app as one line of compact JSON (no raw newline can appear in `JSON.stringify` output). */
export function serializeApp(app: unknown): string {
  return JSON.stringify(app);
}

/** A shard's file text: a valid JSON array with one app per line, so a diff is line-by-line. */
export function serializeShard(lines: readonly string[]): string {
  return lines.length === 0 ? "[]\n" : `[\n${lines.join(",\n")}\n]\n`;
}

export interface ShardPlan {
  /** One entry per shard: the serialized app lines it holds, in order. */
  shards: string[][];
  /** Exact byte size of each shard's file text, parallel to `shards`. */
  bytes: number[];
  /** Apps whose own line is larger than the limit; each is placed alone in a shard, never dropped. */
  oversize: number;
}

/**
 * Greedy, in-order assignment of serialized app lines to shards no larger than
 * `limitBytes` (counting the brackets, commas and newlines `serializeShard`
 * adds). Always returns at least one shard, so an empty snapshot is `[]`.
 * Throws a `RangeError` if more than `MAX_SHARDS` would be needed.
 */
export function planShards(lines: readonly string[], limitBytes: number = SNAPSHOT_SHARD_LIMIT_BYTES): ShardPlan {
  if (!Number.isInteger(limitBytes) || limitBytes < 16) throw new RangeError(`limitBytes must be an integer of at least 16, got ${limitBytes}`);
  const FRAME = 5; // "[\n" + "\n]\n" = 2 + 3
  const shards: string[][] = [];
  const bytes: number[] = [];
  let cur: string[] = [];
  let curBytes = FRAME;
  let oversize = 0;

  const close = () => {
    shards.push(cur);
    bytes.push(byteLength(serializeShard(cur)));
    cur = [];
    curBytes = FRAME;
  };

  for (const line of lines) {
    const cost = byteLength(line) + (cur.length > 0 ? 2 : 0); // ",\n" joins lines
    if (cur.length > 0 && curBytes + cost > limitBytes) close();
    const add = byteLength(line) + (cur.length > 0 ? 2 : 0);
    if (cur.length === 0 && FRAME + add > limitBytes) oversize += 1;
    cur.push(line);
    curBytes += add;
  }
  if (cur.length > 0 || shards.length === 0) close();
  if (shards.length > MAX_SHARDS) throw new RangeError(`snapshot needs ${shards.length} shards; the most allowed is ${MAX_SHARDS}`);
  return { shards, bytes, oversize };
}

// --- header ---------------------------------------------------------------

export interface SnapshotMeta {
  schema_version: number;
  generated_at: string;
  runner_country: string | null;
  count: number;
  total_bytes: number;
  limit_bytes: number;
  shards: { file: string; count: number; bytes: number }[];
}

/** Build the header for a plan. `generatedAt` and `runnerCountry` come from the caller (this module has no clock). */
export function buildSnapshotMeta(args: { generatedAt: string; runnerCountry: string | null; plan: ShardPlan; limitBytes: number }): SnapshotMeta {
  const shards = args.plan.shards.map((lines, i) => ({ file: shardFileName(i), count: lines.length, bytes: args.plan.bytes[i] }));
  return {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    generated_at: args.generatedAt,
    runner_country: args.runnerCountry,
    count: shards.reduce((n, s) => n + s.count, 0),
    total_bytes: shards.reduce((n, s) => n + s.bytes, 0),
    limit_bytes: args.limitBytes,
    shards,
  };
}

const COUNTRY = /^[A-Za-z]{2}$/;

/**
 * Read a header. `null` unless it is exactly what `buildSnapshotMeta` writes:
 * the right schema version, between 1 and `MAX_SHARDS` shards named in order
 * from `aptoide-snapshot.json`, whole non-negative counts, and a `count` equal
 * to the shards' sum. Never throws.
 */
export function parseSnapshotMeta(value: unknown): SnapshotMeta | null {
  let v = value;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!isRecord(v) || v.schema_version !== SNAPSHOT_SCHEMA_VERSION) return null;
  if (typeof v.generated_at !== "string" || parseStamp(v.generated_at) === null) return null;
  if (v.runner_country !== null && !(typeof v.runner_country === "string" && COUNTRY.test(v.runner_country))) return null;
  const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
  if (!whole(v.count) || !whole(v.total_bytes) || !whole(v.limit_bytes)) return null;
  if (!Array.isArray(v.shards) || v.shards.length < 1 || v.shards.length > MAX_SHARDS) return null;
  const shards: SnapshotMeta["shards"] = [];
  for (let i = 0; i < v.shards.length; i += 1) {
    const s = v.shards[i];
    if (!isRecord(s) || s.file !== shardFileName(i) || !whole(s.count) || !whole(s.bytes)) return null;
    shards.push({ file: s.file as string, count: s.count, bytes: s.bytes });
  }
  if (shards.reduce((n, s) => n + s.count, 0) !== v.count) return null;
  return { schema_version: SNAPSHOT_SCHEMA_VERSION, generated_at: v.generated_at, runner_country: v.runner_country as string | null, count: v.count, total_bytes: v.total_bytes, limit_bytes: v.limit_bytes, shards };
}

// --- loading --------------------------------------------------------------

export interface LoadedSnapshot {
  apps: Rec[];
  meta: SnapshotMeta | null;
  /** Anything that means the catalog may be incomplete. Empty for a healthy snapshot and for "no snapshot yet". */
  problems: string[];
}

/**
 * Read the snapshot through `readText(fileName)`, which must return the file's
 * text or `null` when the file does not exist (and throw for any other failure,
 * which this function lets propagate). Reads the header first; with no header
 * it reads shard 0 alone, so the committed single-file snapshot loads as it
 * always did. An invalid header, a missing shard, a shard that is not a JSON
 * array, or a count that disagrees with the header is reported in `problems`
 * and the apps that did load are still returned. Items that are not objects
 * with a string `package` are skipped and counted in a problem line.
 */
export async function loadSnapshotFrom(readText: (fileName: string) => Promise<string | null>): Promise<LoadedSnapshot> {
  const problems: string[] = [];
  const metaText = await readText(SNAPSHOT_META_FILE);
  let meta: SnapshotMeta | null = null;
  let files: string[] = [SNAPSHOT_FILE];
  if (metaText !== null) {
    meta = parseSnapshotMeta(metaText);
    if (meta) files = meta.shards.map((s) => s.file);
    else problems.push("invalid_meta");
  }

  const apps: Rec[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const text = await readText(file);
    if (text === null) {
      // No header and no shard 0 is simply "no snapshot yet".
      if (!(meta === null && metaText === null && i === 0)) problems.push(`missing_shard:${file}`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      problems.push(`unreadable_shard:${file}`);
      continue;
    }
    if (!Array.isArray(parsed)) {
      problems.push(`not_an_array:${file}`);
      continue;
    }
    let kept = 0;
    let skipped = 0;
    for (const item of parsed) {
      if (isRecord(item) && typeof item.package === "string") {
        apps.push(item);
        kept += 1;
      } else skipped += 1;
    }
    if (skipped > 0) problems.push(`skipped_items:${file}:${skipped}`);
    if (meta && meta.shards[i].count !== parsed.length) problems.push(`count_mismatch:${file}`);
  }
  return { apps, meta, problems };
}
