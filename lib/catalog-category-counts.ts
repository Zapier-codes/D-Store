/**
 * Published `catalog_app` rows counted per (app_type, category) — leaf `5.l.xiii.zo`.
 *
 * SERVER-ONLY. The `/categories` index shows a count for each of its 49 entries. Before this leaf each
 * count was a whole-catalog pass. Here it is one request to the `catalog_category_counts` SQL function
 * (`supabase/migrations/20261002030000_catalog_category_counts_fn.sql`, which the operator applies)
 * over PostgREST's `/rpc` endpoint with the service-role key (`SUPABASE_URL` /
 * `SUPABASE_SERVICE_ROLE_KEY` read at call time, as every other table reader here does).
 *
 * Exclusions: the merged catalog drops a third-party row whose package name (or slug) belongs to a
 * first-party app, so the caller passes the first-party package names and slugs and the function leaves
 * those rows out. They travel in the POST body, not the URL, but are still capped at
 * `COUNT_EXCLUDE_MAX` each (more is refused as `unavailable` and the caller falls back), the same cap
 * the footer count (`lib/catalog-count.ts`) uses.
 *
 * Contract (same shape as `lib/catalog-count.ts`):
 * - Never throws. `not_configured` makes no request. `unavailable` is one reason for everything else
 *   (a list over the cap, non-2xx, a missing function because the migration has not been applied,
 *   network error, timeout, redirect, oversized body, not an array, a malformed row, a repeated pair).
 *   Never a partial answer: one bad row refuses the whole thing.
 * - Nothing is logged but fixed labels plus an HTTP status. `redirect: "error"`.
 * - A pair the table has no rows for is absent from `counts`; the caller reads absent as 0.
 */

import {
  CATALOG_MAX_BODY_BYTES,
  CATALOG_TABLE_TIMEOUT_MS,
  readCatalogTableConfig,
  type CatalogAppType,
  type CatalogTableDeps,
} from "./catalog-table";
import { COUNT_EXCLUDE_MAX } from "./catalog-count";

/** Most (app_type, category) groups an answer may hold. The vocabulary is 49 plus `uncategorized`; this is slack, not a target. */
export const CATEGORY_COUNTS_MAX_ROWS = 500;

const CATEGORY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export interface CatalogCategoryCount {
  appType: CatalogAppType;
  category: string;
  total: number;
}

export type CatalogCategoryCountsResult =
  | { ok: true; counts: CatalogCategoryCount[] }
  | { ok: false; reason: "not_configured" | "unavailable" };

export interface CatalogCategoryCountsArgs {
  excludePackages?: readonly string[];
  excludeSlugs?: readonly string[];
}

/** The request body, or `null` when an exclusion list is over the cap. Values are de-duplicated and blanks dropped. Exported for tests. */
export function buildCategoryCountsBody(args: CatalogCategoryCountsArgs): { p_exclude_packages: string[]; p_exclude_slugs: string[] } | null {
  const clean = (values: readonly string[] | undefined) => [...new Set(values ?? [])].filter((value) => typeof value === "string" && value !== "");
  const packages = clean(args.excludePackages);
  const slugs = clean(args.excludeSlugs);
  if (packages.length > COUNT_EXCLUDE_MAX || slugs.length > COUNT_EXCLUDE_MAX) return null;
  return { p_exclude_packages: packages, p_exclude_slugs: slugs };
}

function parseCounts(body: unknown): CatalogCategoryCount[] | null {
  if (!Array.isArray(body) || body.length > CATEGORY_COUNTS_MAX_ROWS) return null;
  const seen = new Set<string>();
  const counts: CatalogCategoryCount[] = [];
  for (const item of body) {
    if (typeof item !== "object" || item === null) return null;
    const { app_type, category, total } = item as Record<string, unknown>;
    if (app_type !== "app" && app_type !== "game") return null;
    if (typeof category !== "string" || !CATEGORY_PATTERN.test(category)) return null;
    // bigint can arrive as a JSON number; a string form is refused rather than guessed at.
    if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) return null;
    const key = `${app_type}:${category}`;
    if (seen.has(key)) return null;
    seen.add(key);
    counts.push({ appType: app_type, category, total });
  }
  return counts;
}

export async function readCatalogCategoryCounts(
  args: CatalogCategoryCountsArgs = {},
  deps: CatalogTableDeps = {}
): Promise<CatalogCategoryCountsResult> {
  const cfg = readCatalogTableConfig(deps.env ?? process.env);
  if (!cfg) return { ok: false, reason: "not_configured" };
  const body = buildCategoryCountsBody(args);
  if (body === null) return { ok: false, reason: "unavailable" };

  const doFetch = deps.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? CATALOG_TABLE_TIMEOUT_MS);
  try {
    const res = await doFetch(`${cfg.baseUrl}/rest/v1/rpc/catalog_category_counts`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status < 200 || res.status >= 300) {
      console.error(`catalog-category-counts: failed, status ${res.status}`);
      return { ok: false, reason: "unavailable" };
    }
    const text = await res.text();
    if (text.length > CATALOG_MAX_BODY_BYTES) {
      console.error("catalog-category-counts: answer too large");
      return { ok: false, reason: "unavailable" };
    }
    const counts = parseCounts(JSON.parse(text));
    if (counts === null) {
      console.error("catalog-category-counts: answer was not what was asked for");
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, counts };
  } catch {
    // Network error, timeout (abort), refused redirect or unparsable JSON; the error is not logged
    // because its message can contain the request URL.
    console.error("catalog-category-counts: failed, no response");
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
