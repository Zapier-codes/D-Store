/**
 * One developer's apps from the `catalog_app` table — leaf `5.l.xiv.zi`.
 *
 * SERVER-ONLY. The developer page (`/developer/[slug]`) lists the developer's apps. Before this leaf
 * that list came from loading every app and filtering in memory. Here it is ONE request: a PostgREST
 * select on `catalog_app` filtered by `developer_slug` (the existing `catalog_app_developer_idx`),
 * newest-updated first, with a row limit and `Prefer: count=exact`, so the answer carries both a
 * bounded set of rows and the developer's true total. Service-role key, `SUPABASE_URL` /
 * `SUPABASE_SERVICE_ROLE_KEY` read at call time, as every other table reader here does.
 *
 * NO MIGRATION. A plain filtered select, like `lib/catalog-count.ts` and `lib/catalog-detail.ts`.
 *
 * Exclusions: the merged catalog drops a third-party row whose package name (or slug) belongs to a
 * first-party app, so the caller passes the first-party package names and slugs and they are left out
 * of both the rows and the total (`package_name=not.in.(...)`, `slug=not.in.(...)`, quoted and
 * escaped by `notIn` in `lib/catalog-count.ts`). More than `COUNT_EXCLUDE_MAX` of either is refused
 * (`unavailable`); the caller falls back.
 *
 * Contract (same shape as `lib/catalog-count.ts`):
 * - Never throws. `not_configured` makes no request. `unavailable` is one reason for everything else
 *   (a list over the cap, non-2xx, network error, timeout, redirect, oversized body, not an array,
 *   more rows than asked for, a malformed row, a row that is not this developer's, no usable
 *   `Content-Range`). Never a partial answer: one bad row refuses the whole read.
 * - A developer with no published rows is `{ ok: true, rows: [], total: 0 }`, not a failure. The
 *   caller decides what that means (the page has already looked the developer up).
 * - Nothing is logged but fixed labels plus an HTTP status. `redirect: "error"`.
 */

import {
  CATALOG_MAX_BODY_BYTES,
  CATALOG_TABLE_TIMEOUT_MS,
  parseCatalogRow,
  readCatalogTableConfig,
  type CatalogRow,
  type CatalogTableDeps,
} from "./catalog-table";
import { notIn } from "./catalog-count";

/** Most rows one developer page asks for. A developer with more shows this many, newest first, and the page says so. */
export const DEVELOPER_APPS_LIMIT = 60;
/** Longest developer slug sent; the table only checks that it is non-blank, so only the length is bounded. */
const MAX_DEVELOPER_SLUG_LENGTH = 200;

const ROW_COLUMNS =
  "id,slug,package_name,origin,name,summary,icon,version,app_type,category," +
  "developer_slug,developer_name,license,size_mb,download_url,reported_downloads," +
  "source_created_at,source_updated_at";

export type CatalogDeveloperAppsResult =
  | { ok: true; rows: CatalogRow[]; total: number }
  | { ok: false; reason: "not_configured" | "unavailable" };

export interface CatalogDeveloperAppsArgs {
  developerSlug: string;
  /** 1 to `DEVELOPER_APPS_LIMIT`; default `DEVELOPER_APPS_LIMIT`. */
  limit?: number;
  excludePackages?: readonly string[];
  excludeSlugs?: readonly string[];
}

/** The query string, or `null` for a bad argument (blank or over-long slug, bad limit, an exclusion list over the cap). Exported for tests. */
export function buildDeveloperAppsQuery(args: CatalogDeveloperAppsArgs): string | null {
  const slug = args.developerSlug;
  if (typeof slug !== "string" || slug === "" || slug.length > MAX_DEVELOPER_SLUG_LENGTH) return null;
  const limit = args.limit ?? DEVELOPER_APPS_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > DEVELOPER_APPS_LIMIT) return null;
  const packages = notIn("package_name", args.excludePackages ?? []);
  const slugs = notIn("slug", args.excludeSlugs ?? []);
  if (packages === null || slugs === null) return null;
  return (
    `select=${ROW_COLUMNS}&developer_slug=eq.${encodeURIComponent(slug)}&is_published=eq.true${packages}${slugs}` +
    `&order=source_updated_at.desc,slug.asc&limit=${limit}`
  );
}

function totalFromContentRange(value: string | null): number | null {
  if (value === null) return null;
  const match = /\/(\d{1,12})$/.exec(value.trim());
  if (!match) return null;
  const total = Number(match[1]);
  return Number.isSafeInteger(total) ? total : null;
}

export async function readCatalogDeveloperApps(args: CatalogDeveloperAppsArgs, deps: CatalogTableDeps = {}): Promise<CatalogDeveloperAppsResult> {
  const cfg = readCatalogTableConfig(deps.env ?? process.env);
  if (!cfg) return { ok: false, reason: "not_configured" };
  const query = buildDeveloperAppsQuery(args);
  if (query === null) return { ok: false, reason: "unavailable" };
  const limit = args.limit ?? DEVELOPER_APPS_LIMIT;

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
      console.error(`catalog-developer-apps: failed, status ${res.status}`);
      return { ok: false, reason: "unavailable" };
    }
    const total = totalFromContentRange(res.headers.get("content-range"));
    if (total === null) {
      console.error("catalog-developer-apps: no count in the answer");
      return { ok: false, reason: "unavailable" };
    }
    const text = await res.text();
    if (text.length > CATALOG_MAX_BODY_BYTES) {
      console.error("catalog-developer-apps: answer too large");
      return { ok: false, reason: "unavailable" };
    }
    const body: unknown = JSON.parse(text);
    if (!Array.isArray(body) || body.length > limit || body.length > total) {
      console.error("catalog-developer-apps: answer was not what was asked for");
      return { ok: false, reason: "unavailable" };
    }
    const rows: CatalogRow[] = [];
    for (const item of body) {
      const row = parseCatalogRow(item);
      // The developer asked for must be the developer answered; anything else is not this module's contract.
      if (row === null || row.developer_slug !== args.developerSlug) {
        console.error("catalog-developer-apps: answer held a malformed row");
        return { ok: false, reason: "unavailable" };
      }
      rows.push(row);
    }
    return { ok: true, rows, total };
  } catch {
    // Network error, timeout (abort), refused redirect or unparsable JSON; the error is not logged
    // because its message can contain the request URL.
    console.error("catalog-developer-apps: failed, no response");
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
