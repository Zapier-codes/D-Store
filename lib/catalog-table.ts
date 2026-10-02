/**
 * Paged read and search over the `catalog_app` table — leaf `5.l.i.zo`.
 *
 * SERVER-ONLY. Calls the `catalog_page` SQL function
 * (`supabase/migrations/20261002010000_catalog_page_function.sql`) over
 * Supabase's PostgREST `/rpc` endpoint with the **service-role** key, read from
 * `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` at call time (never at import
 * time, so `next build` needs neither). Import it from server components and
 * route handlers, never from a client component.
 *
 * What this is, and is not:
 * - It returns the table's flat columns (`CatalogRow`), one page at a time. It
 *   does NOT build `App` objects and is not wired into `lib/catalog.ts`; that is
 *   `5.l.ii.zi` (which also reads a single row's `raw` for the detail page).
 *   Nothing calls this module yet.
 * - Zealot (first-party) apps are not rows, so they are not here. The reader
 *   that merges them in front belongs to `5.l.ii.zi`.
 *
 * Contract (same shape as `push-store.ts` / `counter-store.ts`):
 * - Never throws. Every outcome is a `CatalogPageResult`.
 * - `not_configured`: the env vars are unset or unusable. No request is made.
 * - `invalid_input`: the arguments fail validation below. Checked before any
 *   request, so a bad cursor or category never reaches the database.
 * - `unavailable`: the request failed, or the answer was not what the function
 *   returns (non-2xx, network error, timeout, redirect, oversized body, not an
 *   array, a malformed row). Deliberately one reason, and never a partial page:
 *   a page with one bad row is refused whole.
 * - Nothing here logs a query, a cursor or a body; the only log line is a fixed
 *   label plus an HTTP status. Requests use `redirect: "error"` so the key is
 *   never forwarded.
 *
 * Paging: a page asks the function for `limit + 1` rows; the extra row only
 * says whether another page exists and is dropped. `nextCursor` is opaque
 * (base64url of the order, the last row's sort value and its slug), is `null`
 * on the last page, and is tied to the order it was made for.
 *
 * Search: ordered like the `top` chart (reported downloads, then slug), paged
 * the same way. The needle's wildcard characters are escaped inside the SQL
 * function, not here, so no caller can forget; this module only trims it, caps
 * it at 100 characters and treats a blank one as "no results" without a request.
 */

export type CatalogOrder = "top" | "new";
export type CatalogAppType = "app" | "game";

/** The flat columns `catalog_page` returns. `raw` is never part of a list. */
export interface CatalogRow {
  id: string;
  slug: string;
  package_name: string;
  origin: "zealot" | "aptoide";
  name: string;
  summary: string;
  icon: string;
  version: string;
  app_type: CatalogAppType;
  category: string;
  developer_slug: string;
  developer_name: string;
  license: string;
  size_mb: number;
  download_url: string;
  /** Aptoide's own reported figure; `null` = not reported (which orders after 0). */
  reported_downloads: number | null;
  /** ISO timestamps as the database returns them. */
  source_created_at: string;
  source_updated_at: string;
}

export type CatalogPageResult =
  | { ok: true; rows: CatalogRow[]; nextCursor: string | null }
  | { ok: false; reason: "not_configured" | "unavailable" | "invalid_input" };

export interface CatalogPageArgs {
  order: CatalogOrder;
  /** Restrict to one app type. Required when `category` is given. */
  appType?: CatalogAppType;
  /** A category slug inside `appType`. */
  category?: string;
  /** The `nextCursor` of the previous page, for the same `order`. */
  cursor?: string;
  /** 1 to 100; default 24. */
  limit?: number;
  /** Leaf `5.l.xii.zo`: an exact license (1 to 100 characters), as `getApps` compares. */
  license?: string;
  /** Leaf `5.l.xii.zo`: a maximum size in MB, a finite number from 0 to `CATALOG_SIZE_MAX_MB`. */
  maxSizeMb?: number;
}

export interface CatalogSearchArgs {
  query: string;
  appType?: CatalogAppType;
  cursor?: string;
  limit?: number;
}

export const CATALOG_PAGE_DEFAULT = 24;
export const CATALOG_PAGE_MAX = 100;
export const CATALOG_SEARCH_MAX_CHARS = 100;
/** Longest license a filter can name; `catalog_licenses` leaves longer ones out of its list. */
export const CATALOG_LICENSE_MAX_CHARS = 100;
/** Largest size filter accepted; far above any app, it only guards garbage. */
export const CATALOG_SIZE_MAX_MB = 100000;
/** Per-request ceiling: long enough for a cold pooled connection, short of a serverless limit. */
export const CATALOG_TABLE_TIMEOUT_MS = 8000;
/** 101 rows of ~0.5 KB is about 50 KB; anything past this is not a page. */
export const CATALOG_MAX_BODY_BYTES = 1024 * 1024;

/** Injection points for tests; production callers pass nothing. */
export interface CatalogTableDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface Config {
  baseUrl: string;
  key: string;
}

/** `null` when unusable. `https://` only, except `http://` for a loopback host (the local Supabase stack). */
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

export function isCatalogTableConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return readConfig(env) !== null;
}

// ---------------------------------------------------------------------------
// Validation and cursors
// ---------------------------------------------------------------------------

/** The same pattern the table's `catalog_app_slug_format` check enforces. */
const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const CATEGORY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_SLUG_LENGTH = 200;
const MAX_CURSOR_LENGTH = 600;
const TOP_VALUE_PATTERN = /^(-1|\d{1,15})$/;
/** An ISO date-time with a zone, which is what Postgres returns for a timestamptz. */
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

interface Cursor {
  value: string;
  slug: string;
}

function validValue(order: CatalogOrder, value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (order === "top") return TOP_VALUE_PATTERN.test(value);
  return TIMESTAMP_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

function validSlug(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

/** Opaque cursor for the row a page ended on. `null` when the row cannot make a valid one. */
export function encodeCursor(order: CatalogOrder, row: CatalogRow): string | null {
  const value = order === "top" ? String(row.reported_downloads ?? -1) : row.source_updated_at;
  if (!validValue(order, value) || !validSlug(row.slug)) return null;
  return Buffer.from(JSON.stringify({ o: order, v: value, s: row.slug }), "utf8").toString("base64url");
}

/** `null` for anything that is not a cursor this module made for `order`. */
export function decodeCursor(order: CatalogOrder, cursor: unknown): Cursor | null {
  if (typeof cursor !== "string" || cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { o, v, s } = parsed as Record<string, unknown>;
    if (o !== order || !validValue(order, v) || !validSlug(s)) return null;
    return { value: v, slug: s };
  } catch {
    return null;
  }
}

function checkLimit(limit: unknown): number | null {
  if (limit === undefined) return CATALOG_PAGE_DEFAULT;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > CATALOG_PAGE_MAX) return null;
  return limit;
}

function checkAppType(appType: unknown): appType is CatalogAppType | undefined {
  return appType === undefined || appType === "app" || appType === "game";
}

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

function str(value: unknown): value is string {
  return typeof value === "string";
}

/** `null` when the object is not a complete `CatalogRow`; the page is then refused whole. */
function parseRow(value: unknown): CatalogRow | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;
  if (
    !str(r.id) || !validSlug(r.slug) || !str(r.package_name) ||
    (r.origin !== "zealot" && r.origin !== "aptoide") ||
    !str(r.name) || !str(r.summary) || !str(r.icon) || !str(r.version) ||
    (r.app_type !== "app" && r.app_type !== "game") ||
    !str(r.category) || !str(r.developer_slug) || !str(r.developer_name) || !str(r.license) ||
    typeof r.size_mb !== "number" || !Number.isFinite(r.size_mb) || r.size_mb < 0 ||
    !str(r.download_url) ||
    !(r.reported_downloads === null || (typeof r.reported_downloads === "number" && Number.isSafeInteger(r.reported_downloads) && r.reported_downloads >= 0)) ||
    !str(r.source_created_at) || !str(r.source_updated_at)
  ) {
    return null;
  }
  return {
    id: r.id,
    slug: r.slug,
    package_name: r.package_name,
    origin: r.origin,
    name: r.name,
    summary: r.summary,
    icon: r.icon,
    version: r.version,
    app_type: r.app_type,
    category: r.category,
    developer_slug: r.developer_slug,
    developer_name: r.developer_name,
    license: r.license,
    size_mb: r.size_mb,
    download_url: r.download_url,
    reported_downloads: r.reported_downloads as number | null,
    source_created_at: r.source_created_at,
    source_updated_at: r.source_updated_at,
  };
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

interface RpcArgs {
  p_order: CatalogOrder;
  p_app_type?: CatalogAppType;
  p_category?: string;
  p_needle?: string;
  p_after_value?: string;
  p_after_slug?: string;
  p_limit: number;
  p_license?: string;
  p_max_size_mb?: number;
}

function checkLicense(license: unknown): license is string | undefined {
  if (license === undefined) return true;
  return (
    typeof license === "string" &&
    license.length >= 1 &&
    license.length <= CATALOG_LICENSE_MAX_CHARS &&
    license.trim() !== "" &&
    !license.includes("\u0000")
  );
}

function checkMaxSize(size: unknown): size is number | undefined {
  if (size === undefined) return true;
  return typeof size === "number" && Number.isFinite(size) && size >= 0 && size <= CATALOG_SIZE_MAX_MB;
}

async function callCatalogPage(
  order: CatalogOrder,
  args: RpcArgs,
  limit: number,
  deps: CatalogTableDeps,
  label: string,
): Promise<CatalogPageResult> {
  const cfg = readConfig(deps.env ?? process.env);
  if (!cfg) return { ok: false, reason: "not_configured" };

  const doFetch = deps.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? CATALOG_TABLE_TIMEOUT_MS);
  try {
    const res = await doFetch(`${cfg.baseUrl}/rest/v1/rpc/catalog_page`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      // Argument names must match the SQL function's parameters exactly
      // (PostgREST passes RPC arguments by name); undefined keys are dropped.
      body: JSON.stringify(args),
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status < 200 || res.status >= 300) {
      console.error(`catalog-table: ${label} failed, status ${res.status}`);
      return { ok: false, reason: "unavailable" };
    }

    const text = await res.text();
    if (text.length > CATALOG_MAX_BODY_BYTES) {
      console.error(`catalog-table: ${label} answer too large`);
      return { ok: false, reason: "unavailable" };
    }
    const body: unknown = JSON.parse(text);
    // Asked for limit + 1; more than that means the function did not do what
    // this module relies on, so none of it is trusted.
    if (!Array.isArray(body) || body.length > limit + 1) {
      console.error(`catalog-table: ${label} answer was not a page`);
      return { ok: false, reason: "unavailable" };
    }
    const all: CatalogRow[] = [];
    for (const item of body) {
      const row = parseRow(item);
      if (row === null) {
        console.error(`catalog-table: ${label} returned a malformed row`);
        return { ok: false, reason: "unavailable" };
      }
      all.push(row);
    }

    const hasMore = all.length > limit;
    const rows = hasMore ? all.slice(0, limit) : all;
    let nextCursor: string | null = null;
    if (hasMore) {
      nextCursor = encodeCursor(order, rows[rows.length - 1]);
      if (nextCursor === null) {
        console.error(`catalog-table: ${label} last row could not make a cursor`);
        return { ok: false, reason: "unavailable" };
      }
    }
    return { ok: true, rows, nextCursor };
  } catch {
    // Network error, timeout (abort), refused redirect or unparsable JSON. The
    // error object is not logged: its message can contain the request URL.
    console.error(`catalog-table: ${label} failed, no response`);
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One page of the catalog in `top` or `new` order, optionally inside an app
 * type or a category. Pass the previous page's `nextCursor` to continue.
 */
export async function readCatalogPage(args: CatalogPageArgs, deps: CatalogTableDeps = {}): Promise<CatalogPageResult> {
  const order = args?.order;
  if (order !== "top" && order !== "new") return { ok: false, reason: "invalid_input" };
  if (!checkAppType(args.appType)) return { ok: false, reason: "invalid_input" };
  if (args.category !== undefined) {
    if (args.appType === undefined) return { ok: false, reason: "invalid_input" };
    if (typeof args.category !== "string" || !CATEGORY_PATTERN.test(args.category)) return { ok: false, reason: "invalid_input" };
  }
  const limit = checkLimit(args.limit);
  if (limit === null) return { ok: false, reason: "invalid_input" };
  if (!checkLicense(args.license)) return { ok: false, reason: "invalid_input" };
  if (!checkMaxSize(args.maxSizeMb)) return { ok: false, reason: "invalid_input" };

  let cursor: Cursor | null = null;
  if (args.cursor !== undefined) {
    cursor = decodeCursor(order, args.cursor);
    if (cursor === null) return { ok: false, reason: "invalid_input" };
  }

  return callCatalogPage(
    order,
    {
      p_order: order,
      p_app_type: args.appType,
      p_category: args.category,
      p_after_value: cursor?.value,
      p_after_slug: cursor?.slug,
      p_limit: limit + 1,
      // Sent only when asked for, so a call without filters is byte for byte what it was before the
      // migration that added these two parameters, and works whether or not that migration ran.
      p_license: args.license,
      p_max_size_mb: args.maxSizeMb,
    },
    limit,
    deps,
    `read ${order}`,
  );
}

/**
 * One page of apps whose name or summary contains `query` (case-insensitive),
 * in `top` order. A blank query is an empty page, with no request made.
 */
export async function searchCatalogPage(args: CatalogSearchArgs, deps: CatalogTableDeps = {}): Promise<CatalogPageResult> {
  if (typeof args?.query !== "string") return { ok: false, reason: "invalid_input" };
  if (!checkAppType(args.appType)) return { ok: false, reason: "invalid_input" };
  const limit = checkLimit(args.limit);
  if (limit === null) return { ok: false, reason: "invalid_input" };

  let cursor: Cursor | null = null;
  if (args.cursor !== undefined) {
    cursor = decodeCursor("top", args.cursor);
    if (cursor === null) return { ok: false, reason: "invalid_input" };
  }

  const needle = Array.from(args.query.trim()).slice(0, CATALOG_SEARCH_MAX_CHARS).join("").trim();
  if (needle === "") return { ok: true, rows: [], nextCursor: null };

  return callCatalogPage(
    "top",
    {
      p_order: "top",
      p_app_type: args.appType,
      p_needle: needle,
      p_after_value: cursor?.value,
      p_after_slug: cursor?.slug,
      p_limit: limit + 1,
    },
    limit,
    deps,
    "search",
  );
}

// ---------------------------------------------------------------------------
// Licenses of a category — leaf 5.l.xii.zo
// ---------------------------------------------------------------------------

export type CatalogLicensesResult =
  | { ok: true; licenses: string[] }
  | { ok: false; reason: "not_configured" | "unavailable" | "invalid_input" };

/** The most licenses `catalog_licenses` returns; anything more is not the function's answer. */
export const CATALOG_LICENSES_MAX = 100;

/**
 * The distinct licenses (1 to 100 characters) of one category, sorted, for the category page's
 * license dropdown. Same contract as `readCatalogPage`: never throws, one fixed log line on failure,
 * never a partial list (a malformed entry refuses the whole answer). Needs the migration that adds
 * `catalog_licenses` (`20261002020000_catalog_page_filters.sql`); before it runs this is
 * `unavailable` (the function does not exist), which the caller treats as "no filters to show".
 */
export async function readCatalogLicenses(
  args: { appType: CatalogAppType; category: string },
  deps: CatalogTableDeps = {}
): Promise<CatalogLicensesResult> {
  if (args?.appType !== "app" && args?.appType !== "game") return { ok: false, reason: "invalid_input" };
  if (typeof args.category !== "string" || !CATEGORY_PATTERN.test(args.category)) return { ok: false, reason: "invalid_input" };

  const cfg = readConfig(deps.env ?? process.env);
  if (!cfg) return { ok: false, reason: "not_configured" };

  const doFetch = deps.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? CATALOG_TABLE_TIMEOUT_MS);
  try {
    const res = await doFetch(`${cfg.baseUrl}/rest/v1/rpc/catalog_licenses`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ p_app_type: args.appType, p_category: args.category }),
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status < 200 || res.status >= 300) {
      console.error(`catalog-table: read licenses failed, status ${res.status}`);
      return { ok: false, reason: "unavailable" };
    }
    const text = await res.text();
    if (text.length > CATALOG_MAX_BODY_BYTES) {
      console.error("catalog-table: read licenses answer too large");
      return { ok: false, reason: "unavailable" };
    }
    const body: unknown = JSON.parse(text);
    if (!Array.isArray(body) || body.length > CATALOG_LICENSES_MAX) {
      console.error("catalog-table: read licenses answer was not a list");
      return { ok: false, reason: "unavailable" };
    }
    const licenses: string[] = [];
    for (const item of body) {
      const value = typeof item === "object" && item !== null ? (item as Record<string, unknown>).license : undefined;
      if (!checkLicense(value) || value === undefined) {
        console.error("catalog-table: read licenses returned a malformed entry");
        return { ok: false, reason: "unavailable" };
      }
      licenses.push(value);
    }
    return { ok: true, licenses };
  } catch {
    console.error("catalog-table: read licenses failed, no response");
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
