/**
 * Sitemap reads of the `catalog_app` table — leaf `5.l.vi.zo`.
 *
 * SERVER-ONLY. The sitemap lists one URL per app, so it must read every row's slug and update time,
 * but nothing else: not the 7.6 KB of `raw` an app carries, not the flat columns a list needs. Three
 * columns a row (`slug`, `package_name`, `source_updated_at`), about 100 bytes, so a chunk of 1,000
 * rows is about 100 KB.
 *
 * NO MIGRATION. Plain PostgREST selects on `catalog_app` (`/rest/v1/catalog_app?...`, service-role key,
 * `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` read at call time), the same way `lib/catalog-detail.ts`
 * reads one row. The order is `slug.asc`, which the table's unique slug index serves.
 *
 * Why offset and not a keyset cursor (decided here): a sitemap chunk has a fixed URL
 * (`/sitemap-chunks/<n>.xml`) that a crawler fetches on its own, so chunk `n` must be answerable
 * without having read chunk `n-1`. A keyset cursor cannot do that; `offset = n * 1000` can. Offset
 * costs a scan past the skipped rows, which is small at the table's size (10,000 rows; a cheap index
 * scan) and is paid once per chunk per cache window. A row inserted between two chunk fetches can move
 * one URL to the neighbouring chunk, so a crawler may see it twice or, rarely, miss it until the next
 * crawl; for a sitemap that is harmless.
 *
 * Contract (same shape as `lib/catalog-detail.ts`):
 * - Never throws. Every outcome is a result value.
 * - `not_configured`: the env vars are unset or unusable. No request is made.
 * - `unavailable`: the request failed or the answer was not what is relied on (non-2xx, network error,
 *   timeout, redirect, oversized body, not an array, a malformed row, no usable `Content-Range`, or a
 *   chunk SHORTER than the table's own count says it should be). One reason on purpose, and never a
 *   partial chunk: a short list that looked complete would drop apps from the sitemap without a sign.
 *   The short-chunk check is also what catches a PostgREST `max-rows` set below 1,000.
 * - Published rows only (`is_published=eq.true`), so a take-down leaves the sitemap on its own.
 * - Nothing here logs a slug, a body or an error message; the only log lines are fixed labels plus an
 *   HTTP status. Requests use `redirect: "error"` so the key is never forwarded.
 */

import {
  CATALOG_MAX_BODY_BYTES,
  CATALOG_SLUG_PATTERN,
  CATALOG_TABLE_TIMEOUT_MS,
  readCatalogTableConfig,
  type CatalogTableDeps,
} from "./catalog-table";
import { SITEMAP_CHUNK_SIZE, SITEMAP_CHUNKS_MAX } from "./sitemap-xml";

type Failure = { ok: false; reason: "not_configured" | "unavailable" };

/** What a sitemap needs from a row. */
export interface CatalogSitemapRow {
  slug: string;
  package_name: string;
  /** ISO timestamp as the database returns it. */
  updated_at: string;
}

export type CatalogSitemapTotal = { ok: true; total: number } | Failure;
export type CatalogSitemapChunk = { ok: true; rows: CatalogSitemapRow[]; total: number } | Failure;

const MAX_SLUG_LENGTH = 200;

type Fetched = { ok: true; items: unknown[]; total: number } | Failure;

/** The total after the last slash of a `Content-Range` such as `0-999/10000` (an empty answer has a star before the slash); `null` when absent or not a count. */
function totalFromContentRange(value: string | null): number | null {
  if (value === null) return null;
  const match = /\/(\d{1,12})$/.exec(value.trim());
  if (!match) return null;
  const total = Number(match[1]);
  return Number.isSafeInteger(total) ? total : null;
}

/** One GET with an exact count. `query` is a ready-made, already-encoded query string. */
async function selectWithCount(query: string, label: string, maxRows: number, deps: CatalogTableDeps): Promise<Fetched> {
  const cfg = readCatalogTableConfig(deps.env ?? process.env);
  if (!cfg) return { ok: false, reason: "not_configured" };

  const doFetch = deps.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? CATALOG_TABLE_TIMEOUT_MS);
  try {
    const res = await doFetch(`${cfg.baseUrl}/rest/v1/catalog_app?${query}`, {
      method: "GET",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        Accept: "application/json",
        // Ask PostgREST for the table's own count of the filtered rows, returned in `Content-Range`.
        Prefer: "count=exact",
      },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status < 200 || res.status >= 300) {
      console.error(`catalog-sitemap: ${label} failed, status ${res.status}`);
      return { ok: false, reason: "unavailable" };
    }
    const total = totalFromContentRange(res.headers.get("content-range"));
    if (total === null) {
      console.error(`catalog-sitemap: ${label} gave no count`);
      return { ok: false, reason: "unavailable" };
    }
    const text = await res.text();
    if (text.length > CATALOG_MAX_BODY_BYTES) {
      console.error(`catalog-sitemap: ${label} answer too large`);
      return { ok: false, reason: "unavailable" };
    }
    const body: unknown = JSON.parse(text);
    if (!Array.isArray(body) || body.length > maxRows) {
      console.error(`catalog-sitemap: ${label} answer was not what was asked for`);
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, items: body, total };
  } catch {
    // Network error, timeout (abort), refused redirect or unparsable JSON. The error object is not
    // logged: its message can contain the request URL.
    console.error(`catalog-sitemap: ${label} failed, no response`);
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

function parseSitemapRow(item: unknown): CatalogSitemapRow | null {
  if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  const { slug, package_name: packageName, source_updated_at: updatedAt } = record;
  if (typeof slug !== "string" || slug.length > MAX_SLUG_LENGTH || !CATALOG_SLUG_PATTERN.test(slug)) return null;
  if (typeof packageName !== "string" || packageName === "") return null;
  if (typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))) return null;
  return { slug, package_name: packageName, updated_at: updatedAt };
}

/** How many published rows the table holds. One row is asked for; only the count is used. */
export async function readCatalogSitemapTotal(deps: CatalogTableDeps = {}): Promise<CatalogSitemapTotal> {
  const got = await selectWithCount("select=slug&is_published=eq.true&limit=1", "count", 1, deps);
  if (!got.ok) return got;
  return { ok: true, total: got.total };
}

/**
 * Chunk `index` (0-based): rows `index * 1000` to `index * 1000 + 999` of the published rows by slug.
 * An index past the end is `{ ok: true, rows: [], total }`: the caller decides that it is a 404.
 */
export async function readCatalogSitemapChunk(index: number, deps: CatalogTableDeps = {}): Promise<CatalogSitemapChunk> {
  if (!Number.isInteger(index) || index < 0 || index >= SITEMAP_CHUNKS_MAX) return { ok: false, reason: "unavailable" };
  const offset = index * SITEMAP_CHUNK_SIZE;

  const got = await selectWithCount(
    `select=slug,package_name,source_updated_at&is_published=eq.true&order=slug.asc&limit=${SITEMAP_CHUNK_SIZE}&offset=${offset}`,
    "read chunk",
    SITEMAP_CHUNK_SIZE,
    deps,
  );
  if (!got.ok) return got;

  // The table's own count says how many rows this chunk must hold. Fewer is a truncated answer
  // (a `max-rows` below the chunk size, or a dropped tail), never a short chunk to be believed.
  const expected = Math.min(SITEMAP_CHUNK_SIZE, Math.max(0, got.total - offset));
  if (got.items.length !== expected) {
    console.error("catalog-sitemap: read chunk did not match the table's count");
    return { ok: false, reason: "unavailable" };
  }

  const rows: CatalogSitemapRow[] = [];
  for (const item of got.items) {
    const row = parseSitemapRow(item);
    if (row === null) {
      console.error("catalog-sitemap: read chunk returned a malformed row");
      return { ok: false, reason: "unavailable" };
    }
    rows.push(row);
  }
  return { ok: true, rows, total: got.total };
}
