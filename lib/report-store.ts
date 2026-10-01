/**
 * Report queue store: the reads (leaf `3.c.vii.zo`) and the one write,
 * `decideReport` (leaf `3.c.viii.zi`).
 *
 * SERVER-ONLY. Reads `report_flag` with the Supabase **service-role** key
 * (`SUPABASE_SERVICE_ROLE_KEY`, deliberately not `NEXT_PUBLIC_…`) at call time,
 * never at import time, so importing this file with the variables unset is
 * safe and `next build` needs neither. Import it only from a page or handler
 * that has already passed `requireModeratorPage()` / `requireModeratorRequest()`
 * (`lib/moderator-gate.ts`): this module does no authentication of its own, and
 * `report_flag` has RLS on with no policy, so the service role is the only
 * thing that can read it.
 *
 * Plain `fetch` to PostgREST, the same choice and the same shape as
 * `lib/push-store.ts` (config check, timeout that also covers the body,
 * `redirect: "error"`, a byte cap, every row validated).
 *
 * Contract:
 * - Never throws. Every outcome is a typed result.
 * - `not_configured`: `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` unset or
 *   unusable (the URL must be `https://`, or `http://` for a loopback host).
 * - `unavailable`: network error, timeout, refused redirect, a non-2xx
 *   response (which includes a database that has not had migration
 *   `20261001020000` applied, so `decision` does not exist: that is a failure,
 *   never an empty list), a body over the cap, non-JSON, a row that fails
 *   validation, or more rows than were asked for. Never a partial answer.
 * - `invalid_input` (`readReports` only): a bad status or cursor, caught
 *   before any request. A bad id given to `readReport` is `not_found`: nothing
 *   can match it, so no request is made.
 * - No read touches `public.application`. New rows carry `app_slug` and no
 *   `application_id` (migration `20261001010000`); old rows are the reverse;
 *   a row must have at least one.
 * - PostgREST error bodies are never read (Postgres error details can quote
 *   row data). The only log line is a fixed label plus an HTTP status. Nothing
 *   here logs a body, a key, a cursor, an id or `details`.
 *
 * Decisions, recorded, for the operator to overrule:
 * 1. **The list does not select `details`.** Anonymous free text is fetched
 *    only by `readReport`, for the one report a moderator opens. Less of it
 *    sits in a page's memory, and a list page cannot render it by accident.
 * 2. **"closed" means `status <> 'open'`.** The legacy Symfony queue used its
 *    own status values and this repo cannot enumerate them, so closed is
 *    everything that is not open rather than one guessed value.
 * 3. **Keyset paging on `(created_at desc, id desc)`**, newest first. The page
 *    size is 1 to 100 (default 50), far under PostgREST's 1000-row `max_rows`
 *    cap, and one extra row is requested to learn whether there is a next
 *    page, so a full page is never mistaken for the last one. `created_at` is
 *    passed back exactly as PostgREST returned it, so the comparison is exact.
 *    The filter and the order use the same database collation for `id`, so
 *    they agree (unlike a client-side sort). The existing index on
 *    `(status, created_at desc)` serves the filter and the first sort key.
 * 4. **`details` is capped at 2000 characters on read** (the intake route's
 *    cap) rather than rejected, so one oversized legacy row cannot make the
 *    whole queue unavailable. It is still untrusted text: render it as text.
 * 5. **Row ids must match `^[A-Za-z0-9._:-]{1,128}$`.** Intake writes UUIDs; a
 *    legacy id outside that shape makes the read `unavailable` rather than
 *    being put into a URL or a cursor unchecked.
 *
 * `decideReport` (leaf `3.c.viii.zi`), the only write:
 * - ONE conditional `PATCH` of `report_flag` with `id=eq.<id>` AND
 *   `status=eq.open` in the filter, `Prefer: return=representation`, setting
 *   `status = 'closed'`, `decision` and `decided_at` and nothing else: no
 *   free-text note and no moderator id (docs/MODERATION.md section 5, step 5).
 *   It is a single SQL `UPDATE ... WHERE id = $1 AND status = 'open'`, so two
 *   concurrent decisions cannot both succeed: under READ COMMITTED the second
 *   statement waits for the first, re-checks `status = 'open'` against the
 *   committed row, matches nothing and returns `[]`.
 * - Results: `{ ok: true, report }` when the row was closed by this call;
 *   `already_closed`, `not_found`, `invalid`, `not_configured`, `unavailable`.
 *   `invalid` is a decision that is not one of `REPORT_DECISIONS` (no
 *   request); a bad id is `not_found` (no request), as in `readReport`.
 * 6. **An empty `[]` from the update is told apart by a follow-up
 *    `readReport(id)`:** no row -> `not_found`; a row whose status is not
 *    `open` -> `already_closed`; a row that is STILL open (the update matched
 *    nothing but the row says it should have) -> `unavailable`, never a
 *    claim either way. This costs one extra read only on the losing path.
 * 7. **`decided_at` is the server's clock** (`deps.now`, default `new Date()`),
 *    sent as an ISO string. The column has no default and PostgREST cannot
 *    call `now()` from a PATCH body; a few seconds of skew is acceptable for
 *    an audit timestamp that is shown to moderators only.
 * 8. **The response is trusted only if it says exactly what was asked:** one
 *    row, the same id, `status = 'closed'`, the requested `decision`, a
 *    `decided_at`. Anything else is `unavailable` (the write may have
 *    happened; the caller should re-read, not retry blindly).
 * 9. **No retry, no read of a PostgREST error body.** A timeout leaves the
 *    outcome unknown, so it is `unavailable`; calling again is safe because
 *    the `status = 'open'` filter makes a repeat answer `already_closed`.
 */

import { REPORT_SLUG_PATTERN } from "./report-intake";

export const REPORT_DECISIONS = ["no_action", "relabel", "remove", "escalate"] as const;
export type ReportDecision = (typeof REPORT_DECISIONS)[number];

export type ReportStatusFilter = "open" | "closed";

/** What the list needs. No `details`. */
export interface ReportSummary {
  id: string;
  /** The catalog slug the report is about; null on a legacy row. */
  app_slug: string | null;
  /** Legacy reference to `application.id`; null on a new row. At least one of the two is set. */
  application_id: string | null;
  reason: string;
  status: string;
  decision: ReportDecision | null;
  decided_at: string | null;
  created_at: string;
}

/** One report in full. `details` is anonymous, attacker-controlled text. */
export interface ReportDetail extends ReportSummary {
  details: string | null;
}

/** Where the next page starts: strictly after this row in `(created_at desc, id desc)` order. */
export interface ReportCursor {
  created_at: string;
  id: string;
}

export type ReadReportsResult =
  | { ok: true; reports: ReportSummary[]; next_cursor: ReportCursor | null }
  | { ok: false; reason: "not_configured" | "unavailable" | "invalid_input" };

export type ReadReportResult =
  | { ok: true; report: ReportDetail }
  | { ok: false; reason: "not_configured" | "unavailable" | "not_found" };

export const REPORT_STORE_TIMEOUT_MS = 8000;
export const REPORT_STORE_MAX_BODY_BYTES = 512 * 1024;
export const REPORT_PAGE_DEFAULT = 50;
export const REPORT_PAGE_MAX = 100;
export const REPORT_DETAILS_MAX = 2000;

/** Injection points for tests; production callers pass nothing. */
export interface ReportStoreDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** The clock `decideReport` stamps `decided_at` with. */
  now?: () => Date;
}

export interface ReadReportsOptions {
  status: ReportStatusFilter;
  /** From a previous page's `next_cursor`, after `decodeReportCursor`. */
  cursor?: ReportCursor | null;
  /** 1 to `REPORT_PAGE_MAX`; anything else falls back to the default or is clamped. */
  limit?: number;
}

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
// ISO-8601 as PostgREST prints timestamptz, e.g. 2026-10-01T12:00:00.123456+00:00.
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

function isTimestamp(v: unknown): v is string {
  return typeof v === "string" && TIMESTAMP_PATTERN.test(v) && Number.isFinite(Date.parse(v));
}

function isId(v: unknown): v is string {
  return typeof v === "string" && ID_PATTERN.test(v);
}

// --- Cursor (opaque to callers, validated on the way in) -------------------

/** URL-safe opaque form of a cursor, for a query string. */
export function encodeReportCursor(cursor: ReportCursor): string {
  return Buffer.from(JSON.stringify({ t: cursor.created_at, i: cursor.id }), "utf8").toString("base64url");
}

/** The inverse. Anything that is not a well-formed cursor is `null`, never a throw. */
export function decodeReportCursor(raw: unknown): ReportCursor | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const { t, i } = parsed as { t?: unknown; i?: unknown };
    if (!isTimestamp(t) || !isId(i)) return null;
    return { created_at: t, id: i };
  } catch {
    return null;
  }
}

// --- Config ----------------------------------------------------------------

interface Config {
  baseUrl: string;
  key: string;
}

/**
 * Same rules as `lib/push-store.ts`'s `readConfig` (kept private there, so
 * repeated here rather than changing a verified module): `https://`, or
 * `http://` for a loopback host; no credentials in the URL.
 */
function readConfig(env: Record<string, string | undefined>): Config | null {
  const rawUrl = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rawUrl || !key) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
  if (url.username || url.password) return null;
  return { baseUrl: url.origin, key };
}

/** True when both env vars are present and usable. */
export function isReportStoreConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return readConfig(env) !== null;
}

// --- One capped JSON read --------------------------------------------------

type ReadJson = { ok: true; json: unknown } | { ok: false };

/** A write: the only one this module makes is a conditional `PATCH` that returns the changed rows. */
interface WriteRequest {
  method: "PATCH";
  body: string;
}

async function requestJson(
  cfg: Config,
  deps: ReportStoreDeps,
  path: string,
  label: string,
  write?: WriteRequest,
): Promise<ReadJson> {
  const doFetch = deps.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? REPORT_STORE_TIMEOUT_MS);
  try {
    const res = await doFetch(`${cfg.baseUrl}${path}`, {
      method: write ? write.method : "GET",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        Accept: "application/json",
        ...(write ? { "Content-Type": "application/json", Prefer: "return=representation" } : {}),
      },
      ...(write ? { body: write.body } : {}),
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status < 200 || res.status >= 300) {
      console.error(`report-store: ${label} failed, status ${res.status}`);
      return { ok: false };
    }

    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > REPORT_STORE_MAX_BODY_BYTES) {
      console.error(`report-store: ${label} failed, body too large`);
      await res.body?.cancel().catch(() => undefined);
      return { ok: false };
    }

    let text: string;
    if (res.body) {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > REPORT_STORE_MAX_BODY_BYTES) {
          await reader.cancel().catch(() => undefined);
          console.error(`report-store: ${label} failed, body too large`);
          return { ok: false };
        }
        chunks.push(value);
      }
      const all = new Uint8Array(total);
      let at = 0;
      for (const c of chunks) {
        all.set(c, at);
        at += c.byteLength;
      }
      text = new TextDecoder("utf-8", { fatal: true }).decode(all);
    } else {
      text = await res.text();
    }

    try {
      return { ok: true, json: JSON.parse(text) };
    } catch {
      console.error(`report-store: ${label} failed, body is not JSON`);
      return { ok: false };
    }
  } catch {
    // The error object is not logged: its message can contain the request URL.
    console.error(`report-store: ${label} failed, no response`);
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

// --- Row validation --------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `null` when the row is not the shape this module reads. */
function parseSummary(row: unknown): ReportSummary | null {
  if (!isRecord(row)) return null;
  const { id, app_slug, application_id, reason, status, decision, decided_at, created_at } = row;

  if (!isId(id)) return null;
  if (app_slug !== null && !(typeof app_slug === "string" && REPORT_SLUG_PATTERN.test(app_slug))) return null;
  if (application_id !== null && !isId(application_id)) return null;
  if (app_slug === null && application_id === null) return null;
  if (typeof reason !== "string" || reason.length === 0 || reason.length > 200) return null;
  if (typeof status !== "string" || status.length === 0 || status.length > 64) return null;
  if (decision !== null && !(REPORT_DECISIONS as readonly unknown[]).includes(decision)) return null;
  if (decided_at !== null && !isTimestamp(decided_at)) return null;
  if (!isTimestamp(created_at)) return null;

  return {
    id,
    app_slug: app_slug as string | null,
    application_id: application_id as string | null,
    reason,
    status,
    decision: decision as ReportDecision | null,
    decided_at: decided_at as string | null,
    created_at,
  };
}

function parseDetail(row: unknown): ReportDetail | null {
  const summary = parseSummary(row);
  if (!summary || !isRecord(row)) return null;
  const { details } = row;
  if (details !== null && typeof details !== "string") return null;
  return { ...summary, details: details === null ? null : (details as string).slice(0, REPORT_DETAILS_MAX) };
}

// --- Reads -----------------------------------------------------------------

const SUMMARY_COLUMNS = "id,app_slug,application_id,reason,status,decision,decided_at,created_at";
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS},details`;

function clampLimit(limit: unknown): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return REPORT_PAGE_DEFAULT;
  return Math.min(REPORT_PAGE_MAX, Math.max(1, Math.floor(limit)));
}

/**
 * One page of reports, newest first. Returns `reports` (at most `limit`) and
 * `next_cursor`, which is non-null exactly when at least one more row exists.
 * A malformed row, or a response with more rows than the one-extra probe asks
 * for, is `unavailable`: the page is never partly trusted.
 */
export async function readReports(options: ReadReportsOptions, deps: ReportStoreDeps = {}): Promise<ReadReportsResult> {
  try {
    const { status } = options;
    if (status !== "open" && status !== "closed") return { ok: false, reason: "invalid_input" };
    const cursor = options.cursor ?? null;
    if (cursor !== null && !(isTimestamp(cursor.created_at) && isId(cursor.id))) {
      return { ok: false, reason: "invalid_input" };
    }

    const cfg = readConfig(deps.env ?? process.env);
    if (!cfg) return { ok: false, reason: "not_configured" };

    const limit = clampLimit(options.limit);
    const params = new URLSearchParams();
    params.set("select", SUMMARY_COLUMNS);
    params.set("status", status === "open" ? "eq.open" : "neq.open");
    params.set("order", "created_at.desc,id.desc");
    params.set("limit", String(limit + 1));
    if (cursor) {
      // Both values were validated above, so none holds a quote or a comma.
      const t = `"${cursor.created_at}"`;
      const i = `"${cursor.id}"`;
      params.set("or", `(created_at.lt.${t},and(created_at.eq.${t},id.lt.${i}))`);
    }

    const res = await requestJson(cfg, deps, `/rest/v1/report_flag?${params.toString()}`, "readReports");
    if (!res.ok) return { ok: false, reason: "unavailable" };
    if (!Array.isArray(res.json) || res.json.length > limit + 1) return { ok: false, reason: "unavailable" };

    const rows: ReportSummary[] = [];
    for (const raw of res.json) {
      const row = parseSummary(raw);
      if (!row) return { ok: false, reason: "unavailable" };
      rows.push(row);
    }

    const hasMore = rows.length > limit;
    const reports = hasMore ? rows.slice(0, limit) : rows;
    const last = reports[reports.length - 1];
    return {
      ok: true,
      reports,
      next_cursor: hasMore && last ? { created_at: last.created_at, id: last.id } : null,
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** One report in full, by id. An id that is not the expected shape is `not_found` without a request. */
export async function readReport(id: unknown, deps: ReportStoreDeps = {}): Promise<ReadReportResult> {
  try {
    if (!isId(id)) return { ok: false, reason: "not_found" };

    const cfg = readConfig(deps.env ?? process.env);
    if (!cfg) return { ok: false, reason: "not_configured" };

    const params = new URLSearchParams();
    params.set("select", DETAIL_COLUMNS);
    params.set("id", `eq.${id}`);
    params.set("limit", "2");

    const res = await requestJson(cfg, deps, `/rest/v1/report_flag?${params.toString()}`, "readReport");
    if (!res.ok) return { ok: false, reason: "unavailable" };
    if (!Array.isArray(res.json) || res.json.length > 1) return { ok: false, reason: "unavailable" }; // `id` is the primary key
    if (res.json.length === 0) return { ok: false, reason: "not_found" };

    const report = parseDetail(res.json[0]);
    if (!report || report.id !== id) return { ok: false, reason: "unavailable" };
    return { ok: true, report };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

// --- The one write ---------------------------------------------------------

export type DecideReportResult =
  | { ok: true; report: ReportSummary }
  | { ok: false; reason: "already_closed" | "not_found" | "invalid" | "not_configured" | "unavailable" };

/**
 * Close one open report with a decision. Never throws.
 *
 * `invalid` (decision not in `REPORT_DECISIONS`) and `not_found` (id not the
 * expected shape) are decided before any request. `{ ok: true, report }` means
 * THIS call moved the row from open to closed. `already_closed` means the row
 * exists and was not open, which is also what the loser of two concurrent
 * decisions sees. No note and no moderator id are written.
 */
export async function decideReport(id: unknown, decision: unknown, deps: ReportStoreDeps = {}): Promise<DecideReportResult> {
  try {
    if (typeof decision !== "string" || !(REPORT_DECISIONS as readonly string[]).includes(decision)) {
      return { ok: false, reason: "invalid" };
    }
    if (!isId(id)) return { ok: false, reason: "not_found" };

    const cfg = readConfig(deps.env ?? process.env);
    if (!cfg) return { ok: false, reason: "not_configured" };

    // Throws RangeError on an invalid Date, before any request; caught below.
    const decidedAt = (deps.now ? deps.now() : new Date()).toISOString();

    const params = new URLSearchParams();
    params.set("select", SUMMARY_COLUMNS);
    params.set("id", `eq.${id}`);
    params.set("status", "eq.open");

    const res = await requestJson(cfg, deps, `/rest/v1/report_flag?${params.toString()}`, "decideReport", {
      method: "PATCH",
      body: JSON.stringify({ status: "closed", decision, decided_at: decidedAt }),
    });
    if (!res.ok) return { ok: false, reason: "unavailable" };
    if (!Array.isArray(res.json) || res.json.length > 1) return { ok: false, reason: "unavailable" }; // `id` is the primary key

    if (res.json.length === 1) {
      const report = parseSummary(res.json[0]);
      if (!report || report.id !== id || report.status !== "closed" || report.decision !== decision || report.decided_at === null) {
        return { ok: false, reason: "unavailable" };
      }
      return { ok: true, report };
    }

    // `[]`: the filter matched no row. Tell "no such report" from "not open" with one read.
    const after = await readReport(id, deps);
    if (after.ok) {
      return after.report.status === "open" ? { ok: false, reason: "unavailable" } : { ok: false, reason: "already_closed" };
    }
    return { ok: false, reason: after.reason === "not_found" ? "not_found" : "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
