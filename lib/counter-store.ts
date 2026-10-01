/**
 * Counter store — leaf `5.g.v.zo`, part (d).
 *
 * SERVER-ONLY. Writes the install and view counters and the search log to
 * Supabase through PostgREST with the service-role key: the two SQL functions
 * `increment_app_install(p_slug)` / `increment_app_view(p_slug)` (migration
 * `20260930100000_create_app_counter.sql`) and an insert on `search_log`
 * (migration `20260930100100_create_search_log.sql`). Same posture as
 * `lib/stats-store.ts` and `lib/push-store.ts`: plain `fetch`, the key read at
 * call time (never at import), https or loopback http only, `redirect: "error"`,
 * a timeout, and a body cap.
 *
 * Contract:
 * - Never throws. Results are `{ ok: true, count }` (counters), `{ ok: true }`
 *   (search log) or `{ ok: false, reason }` with `reason` one of
 *   `not_configured` and `unavailable`. PostgREST error bodies are never read.
 * - The caller decides what a failure means; this file only reports it.
 * - Nothing here logs a body, a key or a slug; the only log line is a fixed
 *   label plus an HTTP status.
 * - The slug is NOT checked here. The caller must have checked it against the
 *   catalog first, so a visitor cannot mint counter rows by varying it.
 */

export const COUNTER_STORE_TIMEOUT_MS = 4000;
export const COUNTER_STORE_MAX_BODY_BYTES = 4096;
/** `search_log.query_norm` allows 1 to 200 characters; the caller truncates first (migration header). */
export const SEARCH_LOG_MAX_LENGTH = 200;

export interface CounterStoreDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export type CounterKind = "install" | "view";

export type CounterResult =
  | { ok: true; count: number }
  | { ok: false; reason: "not_configured" | "unavailable" };

export type SearchLogResult = { ok: true } | { ok: false; reason: "not_configured" | "unavailable" };

interface Config {
  baseUrl: string;
  key: string;
}

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

export function isCounterStoreConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return readConfig(env) !== null;
}

/** Reads at most `max` bytes of the body as text, or `null` when it is longer. */
async function readCapped(res: Response, max: number): Promise<string | null> {
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > max) return null;
  return new TextDecoder().decode(buf);
}

/** Increments one counter and returns the new value. Slug shape is the caller's to check. */
export async function incrementCounter(
  kind: CounterKind,
  slug: string,
  deps: CounterStoreDeps = {},
): Promise<CounterResult> {
  const cfg = readConfig(deps.env ?? process.env);
  if (!cfg) return { ok: false, reason: "not_configured" };
  const fn = kind === "install" ? "increment_app_install" : "increment_app_view";
  try {
    const res = await (deps.fetch ?? fetch)(`${cfg.baseUrl}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ p_slug: slug }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(deps.timeoutMs ?? COUNTER_STORE_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[counter-store] ${fn} failed`, res.status);
      return { ok: false, reason: "unavailable" };
    }
    const text = await readCapped(res, COUNTER_STORE_MAX_BODY_BYTES);
    if (text === null) return { ok: false, reason: "unavailable" };
    // PostgREST returns a scalar function result as a bare JSON number.
    const value: unknown = JSON.parse(text);
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, count: value };
  } catch {
    console.error(`[counter-store] ${fn} failed, no response`);
    return { ok: false, reason: "unavailable" };
  }
}

/** Normalizes a search for the log: trimmed, lower-cased, cut to the column limit. `null` when nothing is left. */
export function normalizeSearchQuery(query: string): string | null {
  const norm = query.trim().toLowerCase().slice(0, SEARCH_LOG_MAX_LENGTH).trim();
  return norm === "" ? null : norm;
}

/** Appends one row to `search_log`. Stores the normalized text only: no address, no device id. */
export async function logSearch(query: string, deps: CounterStoreDeps = {}): Promise<SearchLogResult> {
  const cfg = readConfig(deps.env ?? process.env);
  if (!cfg) return { ok: false, reason: "not_configured" };
  const norm = normalizeSearchQuery(query);
  if (norm === null) return { ok: true }; // nothing to record is not a failure
  try {
    const res = await (deps.fetch ?? fetch)(`${cfg.baseUrl}/rest/v1/search_log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ query_norm: norm }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(deps.timeoutMs ?? COUNTER_STORE_TIMEOUT_MS),
    });
    if (res.status >= 200 && res.status < 300) return { ok: true };
    console.error("[counter-store] search_log insert failed", res.status);
    return { ok: false, reason: "unavailable" };
  } catch {
    console.error("[counter-store] search_log insert failed, no response");
    return { ok: false, reason: "unavailable" };
  }
}
