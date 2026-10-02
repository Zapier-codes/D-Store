/**
 * A count of published `catalog_app` rows — leaf `5.l.xiii.zi`.
 *
 * SERVER-ONLY. The footer (on every page) shows how many apps the store lists. Before this leaf that
 * number came from loading every app. Here it is one request: a PostgREST select of one row with
 * `Prefer: count=exact`, whose `Content-Range` carries the table's own count. No row data is used.
 *
 * NO MIGRATION. Plain filtered select on `catalog_app` (service-role key, `SUPABASE_URL` /
 * `SUPABASE_SERVICE_ROLE_KEY` read at call time), the same way `lib/catalog-sitemap.ts` counts.
 *
 * Exclusions: the merged catalog drops a third-party row whose package name (or slug) belongs to a
 * first-party app, so the caller passes the first-party package names and slugs and they are left
 * out of the count with `package_name=not.in.(...)` and `slug=not.in.(...)`. Each value is
 * double-quoted and escaped, so a comma or a quote in a value cannot change the filter. More than
 * `COUNT_EXCLUDE_MAX` of either list is refused (`unavailable`) rather than sent as a very long URL;
 * the caller falls back.
 *
 * Contract (same shape as `lib/catalog-sitemap.ts`):
 * - Never throws. `not_configured` makes no request. `unavailable` is one reason for everything else
 *   (non-2xx, network error, timeout, redirect, oversized body, not an array, no usable
 *   `Content-Range`). Nothing is logged but fixed labels plus an HTTP status. `redirect: "error"`.
 */

import {
  CATALOG_MAX_BODY_BYTES,
  CATALOG_TABLE_TIMEOUT_MS,
  readCatalogTableConfig,
  type CatalogTableDeps,
} from "./catalog-table";

/** Most first-party package names (and, separately, slugs) a count will exclude. */
export const COUNT_EXCLUDE_MAX = 200;

export type CatalogCountResult =
  | { ok: true; total: number }
  | { ok: false; reason: "not_configured" | "unavailable" };

export interface CatalogCountArgs {
  excludePackages?: readonly string[];
  excludeSlugs?: readonly string[];
}

/** One PostgREST `not.in.(...)` list (exported for `lib/catalog-developer-apps.ts`, leaf `5.l.xiv.zi`): each value quoted, `\` and `"` escaped, the whole thing URL-encoded. */
export function notIn(column: string, values: readonly string[]): string | null {
  const unique = [...new Set(values)].filter((value) => typeof value === "string" && value !== "");
  if (unique.length === 0) return "";
  if (unique.length > COUNT_EXCLUDE_MAX) return null;
  const quoted = unique.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",");
  return `&${column}=${encodeURIComponent(`not.in.(${quoted})`)}`;
}

/** The query string of the count request, or `null` when an exclusion list is too long. Exported for tests. */
export function buildCountQuery(args: CatalogCountArgs): string | null {
  const packages = notIn("package_name", args.excludePackages ?? []);
  const slugs = notIn("slug", args.excludeSlugs ?? []);
  if (packages === null || slugs === null) return null;
  return `select=slug&is_published=eq.true${packages}${slugs}&limit=1`;
}

function totalFromContentRange(value: string | null): number | null {
  if (value === null) return null;
  const match = /\/(\d{1,12})$/.exec(value.trim());
  if (!match) return null;
  const total = Number(match[1]);
  return Number.isSafeInteger(total) ? total : null;
}

export async function readCatalogPublishedCount(args: CatalogCountArgs = {}, deps: CatalogTableDeps = {}): Promise<CatalogCountResult> {
  const cfg = readCatalogTableConfig(deps.env ?? process.env);
  if (!cfg) return { ok: false, reason: "not_configured" };
  const query = buildCountQuery(args);
  if (query === null) return { ok: false, reason: "unavailable" };

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
        Prefer: "count=exact",
      },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status < 200 || res.status >= 300) {
      console.error(`catalog-count: failed, status ${res.status}`);
      return { ok: false, reason: "unavailable" };
    }
    const total = totalFromContentRange(res.headers.get("content-range"));
    if (total === null) {
      console.error("catalog-count: no count in the answer");
      return { ok: false, reason: "unavailable" };
    }
    const text = await res.text();
    if (text.length > CATALOG_MAX_BODY_BYTES || !Array.isArray(JSON.parse(text))) {
      console.error("catalog-count: answer was not what was asked for");
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, total };
  } catch {
    // Network error, timeout (abort), refused redirect or unparsable JSON; the error is not logged
    // because its message can contain the request URL.
    console.error("catalog-count: failed, no response");
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
