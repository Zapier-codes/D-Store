/**
 * `GET /api/catalog` — leaf `7.b.i.zi`: a read-only, cursor-paged catalog API over `catalog_app`, for Storeapp.
 * The logic lives here, with injected readers, so every status is testable without Next (the shape of
 * `lib/stats-handler.ts`); `app/api/catalog/route.ts` only wires the real ones.
 *
 * Query (all optional; anything else is ignored, a repeated or malformed one is `400`):
 *   `order`    `top` (default; Aptoide's reported downloads) or `new` (most recently updated first).
 *   `type`     `app` or `game`.
 *   `category` a category slug; needs `type`, because a slug is only unambiguous inside its app type.
 *   `q`        a search needle (name or summary); search is `top` order only and takes no `category`.
 *   `limit`    1 to 100, default 50.
 *   `cursor`   the `next_cursor` of the previous page; opaque, tied to the order it came from.
 *
 * Answer, `200`: `{ "apps": [...], "next_cursor": string | null }`. `next_cursor` is `null` on the last page.
 * Each app: `origin`, `package_name`, `slug`, `name`, `version`, `icon`, `summary`, `app_type`, `category`,
 * `developer { slug, name }`, `license`, `size_mb`, `download_url`, `reported_downloads`, `updated_at`.
 *
 * Statuses: `400` a bad query (checked before any database call), `503` Supabase not configured,
 * `502` the table could not be read. Fixed-string error bodies that echo nothing from the request or the store.
 * A page is cacheable (`public`, short, with stale-while-revalidate); every error is `no-store`.
 * `GET` only: the route exports nothing else, so Next answers other methods `405`.
 *
 * What this is NOT, so a client does not assume it:
 *  - No authentication. It serves what the public storefront already shows. The catalog is public data and
 *    Storeapp is a public client with no secret to keep; the service-role key stays on the server.
 *  - `download_url` is whatever the source published, passed through only when it is an `https://` URL
 *    (otherwise `null`). For `origin: "aptoide"` it is a THIRD-PARTY link that this store neither signs nor
 *    vets, and `reported_downloads` is Aptoide's own reported figure, not a D-Store count. Whether and how
 *    Storeapp may install such an app is decision 5a/5b and leaf `7.b.ii.zi`, not settled here.
 *  - Zealot (first-party) apps are not rows, so they are not in this API; Storeapp already gets those from
 *    Zealot's signed index and they win a merged card (leaf `7.b.i.zo`).
 *  - No CORS headers (a native client does not need them) and no rate limit; the CDN cache is the only brake.
 */

import {
  readCatalogPage,
  searchCatalogPage,
  encodeCursor,
  CATALOG_PAGE_MAX,
  type CatalogOrder,
  type CatalogPageResult,
  type CatalogRow,
  type CatalogAppType,
} from "./catalog-table";

export const CATALOG_API_DEFAULT_LIMIT = 50;

export interface CatalogApiDeps {
  readPage?: typeof readCatalogPage;
  searchPage?: typeof searchCatalogPage;
}

export interface CatalogApiApp {
  origin: "zealot" | "aptoide";
  package_name: string;
  slug: string;
  name: string;
  version: string;
  icon: string;
  summary: string;
  app_type: CatalogAppType;
  category: string;
  developer: { slug: string; name: string };
  license: string;
  size_mb: number;
  download_url: string | null;
  reported_downloads: number | null;
  updated_at: string;
}

const NO_STORE = { "Cache-Control": "no-store" };
const CACHEABLE = { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" };

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: NO_STORE });
}

/** The one value of a query parameter: `undefined` when absent, `null` when it is repeated. */
function single(params: URLSearchParams, name: string): string | undefined | null {
  const all = params.getAll(name);
  if (all.length === 0) return undefined;
  if (all.length > 1) return null;
  return all[0];
}

export function toApiApp(row: CatalogRow): CatalogApiApp {
  return {
    origin: row.origin,
    package_name: row.package_name,
    slug: row.slug,
    name: row.name,
    version: row.version,
    icon: row.icon,
    summary: row.summary,
    app_type: row.app_type,
    category: row.category,
    developer: { slug: row.developer_slug, name: row.developer_name },
    license: row.license,
    size_mb: row.size_mb,
    download_url: typeof row.download_url === "string" && row.download_url.startsWith("https://") ? row.download_url : null,
    reported_downloads: row.reported_downloads,
    updated_at: row.source_updated_at,
  };
}

export async function handleCatalog(request: Request, deps: CatalogApiDeps = {}): Promise<Response> {
  let params: URLSearchParams;
  try {
    params = new URL(request.url).searchParams;
  } catch {
    return fail(400, "Bad request");
  }

  const order = single(params, "order");
  const type = single(params, "type");
  const category = single(params, "category");
  const q = single(params, "q");
  const limitText = single(params, "limit");
  const cursor = single(params, "cursor");
  if ([order, type, category, q, limitText, cursor].some((v) => v === null)) return fail(400, "Bad request");

  if (order !== undefined && order !== "top" && order !== "new") return fail(400, "Bad request");
  if (type !== undefined && type !== "app" && type !== "game") return fail(400, "Bad request");
  if (category !== undefined && (type === undefined || category === "")) return fail(400, "Bad request");

  let limit = CATALOG_API_DEFAULT_LIMIT;
  if (limitText !== undefined) {
    if (!/^\d{1,3}$/.test(limitText)) return fail(400, "Bad request");
    limit = Number(limitText);
    if (limit < 1 || limit > CATALOG_PAGE_MAX) return fail(400, "Bad request");
  }

  const wantedOrder: CatalogOrder = (order as CatalogOrder | undefined) ?? "top";
  let result: CatalogPageResult;
  if (q !== undefined) {
    // Search is `top` order only and has no category filter; say so rather than quietly ignoring either.
    if (wantedOrder !== "top" || category !== undefined) return fail(400, "Bad request");
    result = await (deps.searchPage ?? searchCatalogPage)({ query: q, appType: type as CatalogAppType | undefined, cursor, limit });
  } else {
    result = await (deps.readPage ?? readCatalogPage)({
      order: wantedOrder,
      appType: type as CatalogAppType | undefined,
      category,
      cursor,
      limit,
    });
  }

  if (!result.ok) {
    if (result.reason === "invalid_input") return fail(400, "Bad request");
    if (result.reason === "not_configured") return fail(503, "The catalog is not available");
    return fail(502, "Could not read the catalog");
  }
  return Response.json({ apps: result.rows.map(toApiApp), next_cursor: result.nextCursor }, { headers: CACHEABLE });
}

// Re-exported so a test can build a cursor the way the reader does.
export { encodeCursor };
