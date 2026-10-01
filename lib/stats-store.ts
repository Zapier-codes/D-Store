/**
 * Stats store — leaf `5.g.v.zo`.
 *
 * SERVER-ONLY. Calls the `store_stats()` SQL function (migration
 * `20260930100200_store_stats_fn.sql`) through Supabase's PostgREST RPC with the
 * service-role key, and returns the document Zealot's admin reads (Zealot Task
 * 31b, `DstoreStats`). Same shape as `lib/push-store.ts`: plain `fetch`, the key
 * read at call time (never at import, so `next build` needs no configuration),
 * https or loopback http only, `redirect: "error"` so the key is never forwarded,
 * a timeout that also covers the body, and a body cap.
 *
 * Contract:
 * - Never throws. The result is `{ ok: true, stats }` or `{ ok: false, reason }`
 *   where `reason` is `not_configured` or `unavailable` (any non-2xx, redirect,
 *   timeout, oversized or non-JSON body, or a document that does not match the
 *   shape). One `unavailable` reason on purpose: a caller cannot act on the
 *   difference, and PostgREST error bodies are never read (Postgres details can
 *   quote rows).
 * - The document is VALIDATED and REBUILT: only the keys the contract names are
 *   returned, so a column added to the function later (free text, a hash) could
 *   not reach Zealot through this route without a change here and in Zealot's
 *   own validator. The contract is in the migration header and in
 *   `DstoreStats::Document` in the Zealot repo; keep the three in step.
 * - Nothing here logs a body, a key or a figure; the only log line is a fixed
 *   label plus an HTTP status.
 *
 * Nothing calls the database from a page: the route is the only caller.
 */

export const STATS_STORE_TIMEOUT_MS = 8000;
export const STATS_STORE_MAX_BODY_BYTES = 512 * 1024;

export interface StatsDocument {
  generated_at: string;
  traffic: {
    total_installs: number;
    total_views: number;
    apps_tracked: number;
    per_app: Array<{ slug: string; install_count: number; view_count: number }>;
  };
  searches: { total: number; distinct_queries: number; top: Array<{ query: string; count: number }> };
  reports: { total: number; by_status: Record<string, number>; by_reason: Record<string, number> };
  reviews: {
    total: number;
    average_rating: number | null;
    per_app: Array<{ slug: string; count: number; average_rating: number | null }>;
  };
}

export type StatsStoreResult =
  | { ok: true; stats: StatsDocument }
  | { ok: false; reason: "not_configured" | "unavailable" };

export interface StatsStoreDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isRating = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 5);

function rows<T>(list: unknown, pick: (row: Obj) => T | null): T[] | null {
  if (!Array.isArray(list)) return null;
  const out: T[] = [];
  for (const row of list) {
    const picked = isObj(row) ? pick(row) : null;
    if (picked === null) return null;
    out.push(picked);
  }
  return out;
}

function tally(v: unknown): Record<string, number> | null {
  if (!isObj(v)) return null;
  const out: Record<string, number> = Object.create(null);
  for (const [k, n] of Object.entries(v)) {
    if (!isCount(n)) return null;
    out[k] = n;
  }
  return Object.assign({}, out);
}

/** Validates `raw` against the contract and returns a rebuilt document, or `null`. Pure. */
export function parseStatsDocument(raw: unknown): StatsDocument | null {
  if (!isObj(raw) || typeof raw.generated_at !== "string") return null;
  const { traffic, searches, reports, reviews } = raw;
  if (!isObj(traffic) || !isObj(searches) || !isObj(reports) || !isObj(reviews)) return null;
  if (![traffic.total_installs, traffic.total_views, traffic.apps_tracked].every(isCount)) return null;
  if (!isCount(searches.total) || !isCount(searches.distinct_queries) || !isCount(reports.total)) return null;
  if (!isCount(reviews.total) || !isRating(reviews.average_rating)) return null;

  const perApp = rows(traffic.per_app, (r) =>
    typeof r.slug === "string" && isCount(r.install_count) && isCount(r.view_count)
      ? { slug: r.slug, install_count: r.install_count, view_count: r.view_count }
      : null,
  );
  const top = rows(searches.top, (r) =>
    typeof r.query === "string" && isCount(r.count) ? { query: r.query, count: r.count } : null,
  );
  const byStatus = tally(reports.by_status);
  const byReason = tally(reports.by_reason);
  const reviewApps = rows(reviews.per_app, (r) =>
    typeof r.slug === "string" && isCount(r.count) && isRating(r.average_rating)
      ? { slug: r.slug, count: r.count, average_rating: r.average_rating }
      : null,
  );
  if (!perApp || !top || !byStatus || !byReason || !reviewApps) return null;

  return {
    generated_at: raw.generated_at,
    traffic: {
      total_installs: traffic.total_installs as number,
      total_views: traffic.total_views as number,
      apps_tracked: traffic.apps_tracked as number,
      per_app: perApp,
    },
    searches: { total: searches.total, distinct_queries: searches.distinct_queries, top },
    reports: { total: reports.total, by_status: byStatus, by_reason: byReason },
    reviews: { total: reviews.total, average_rating: reviews.average_rating, per_app: reviewApps },
  };
}

function readConfig(env: Record<string, string | undefined>): { url: string; key: string } | null {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const u = new URL(url);
    const loopback = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(u.protocol === "http:" && loopback)) return null;
    return { url: url.replace(/\/+$/, ""), key };
  } catch {
    return null;
  }
}

export function isStatsStoreConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return readConfig(env) !== null;
}

export async function readStoreStats(deps: StatsStoreDeps = {}): Promise<StatsStoreResult> {
  try {
    const cfg = readConfig(deps.env ?? process.env);
    if (!cfg) return { ok: false, reason: "not_configured" };

    const res = await (deps.fetch ?? fetch)(`${cfg.url}/rest/v1/rpc/store_stats`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({}),
      redirect: "error",
      signal: AbortSignal.timeout(deps.timeoutMs ?? STATS_STORE_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("[stats-store] store_stats failed", res.status);
      return { ok: false, reason: "unavailable" };
    }
    const text = await res.text();
    if (text.length > STATS_STORE_MAX_BODY_BYTES) return { ok: false, reason: "unavailable" };
    const stats = parseStatsDocument(JSON.parse(text));
    return stats ? { ok: true, stats } : { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
