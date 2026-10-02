/**
 * Catalog-table source — leaf `5.l.ii.zi`.
 *
 * A `CatalogSource` that reads the Aptoide-origin catalog from the Supabase
 * `catalog_app` table (via `lib/catalog-table.ts`'s paged `catalog_page` read)
 * instead of the snapshot files in `storage/downloads`. It sits behind the same
 * `lib/catalog.ts` interface: `getMergedApps()` still puts the Zealot source
 * first and this source second, so first-party apps still rank ahead and the
 * "first one wins on package_name" merge is unchanged.
 *
 * OPT-IN: `lib/catalog.ts` uses this source only when `CATALOG_SOURCE=table`
 * AND the Supabase env is set (`useCatalogTable`). Otherwise the snapshot source
 * is used exactly as before. Reason: the table is not applied or loaded yet
 * (leaves 4 to 6), and a list row has no `raw`.
 *
 * What a row can and cannot fill (list-grade `App`, honest about the rest):
 * - From the row: id, slug, name, summary, icon, version, app_type, category,
 *   developer, license, size, download link, created/updated, and Aptoide's
 *   reported downloads (as `third_party_stats.downloads`).
 * - NOT in a list row (needs `raw`, which `catalog_page` never returns): the
 *   long description, screenshots, permissions, changelog, rating, content
 *   rating, min Android version, version history, scan rank. They get the same
 *   neutral placeholders `normalizeAptoideApp` uses, and `not_provided` says
 *   so for the fields that have a "Not provided" path. The app detail page needs
 *   `raw` for one slug; that is leaf 11 (`5.l.vi.zi`), so do not turn this on for
 *   a deployment that serves detail pages until then.
 *
 * Reads the whole table by following `nextCursor` (100 a page, sequential),
 * capped at `MAX_TABLE_APPS`, once per server lifetime (cached by
 * `getMergedApps`). This is a bridge so every existing caller keeps working;
 * leaves 7 to 11 replace the callers with paged reads and then leaf 13 removes
 * this whole-catalog path. If any page fails the source throws; `getMergedApps`
 * catches that and uses the snapshot source instead.
 */

import type { App, NotProvidedField } from "../mock-data";
import { ALL_REGIONS } from "../mock-data";
import { readCatalogPage, CATALOG_PAGE_MAX, type CatalogRow, type CatalogTableDeps } from "../catalog-table";
import { isCatalogTableConfigured } from "../catalog-table";
import type { CatalogSource } from "./types";

/** Safety ceiling: the target is 10,000 apps; stop well past it rather than loop. */
export const MAX_TABLE_APPS = 12_000;

/** True only when the operator opted in and the Supabase env is usable. */
export function useCatalogTable(env: Record<string, string | undefined> = process.env): boolean {
  return env.CATALOG_SOURCE?.trim() === "table" && isCatalogTableConfigured(env);
}

/** One list row to a list-grade `App`. Never throws on a valid row. */
export function appFromCatalogRow(row: CatalogRow): App {
  const notProvided: NotProvidedField[] = [
    "play_store_status",
    "monetization",
    "permissions",
    "min_android_version",
    "content_rating",
  ];
  const downloads = row.reported_downloads;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    description: row.summary || "No description provided.",
    site: null,
    source: null,
    tracker: null,
    donate: null,
    icon: row.icon,
    primary_color: "#4a4a4a",
    secondary_color: "#6a6a6a",
    tertiary_color: "#8a8a8a",
    apk: row.download_url,
    version: row.version,
    license: row.license,
    is_published: true,
    category: row.category,
    app_type: row.app_type,
    ...(downloads === null ? {} : { third_party_stats: { rating: null, downloads } }),
    created_at: row.source_created_at,
    updated_at: row.source_updated_at,

    install_count: 0,
    view_count: 0,
    avg_rating: 0,
    rating_count: 0,
    is_featured: false,
    is_editors_pick: false,
    sponsored_slots: [],
    collections: [],
    developer_verified: false,
    min_android_version: "Not provided",
    rollout_percentage: 100,
    rollout_status: "complete",
    release_id: row.version,
    size_mb: row.size_mb,
    sha256_checksum: "Not provided",
    signing_certificate_fingerprint: "Not provided",
    play_store_rejection_reason: null,
    permissions: [],
    screenshots: [],
    changelog: "No changelog provided.",

    developer_slug: row.developer_slug,
    developer_name: row.developer_name,
    developer_website: null,

    available_regions: [...ALL_REGIONS],

    content_rating: "Adults only 18+",
    data_safety: {
      collects_data: false,
      data_types: [],
      shared_with_third_parties: false,
      data_encrypted_in_transit: false,
      can_request_data_deletion: false,
      provided: false,
    },
    contains_ads: false,
    has_in_app_purchases: false,

    origin: "aptoide",
    package_name: row.package_name,
    not_provided: notProvided,
  };
}

/** Reads every published row, newest-downloads first, one page at a time. */
export function createCatalogTableSource(deps: CatalogTableDeps = {}): CatalogSource {
  return {
    origin: "aptoide",
    async getApps(): Promise<App[]> {
      const apps: App[] = [];
      let cursor: string | undefined;
      do {
        const page = await readCatalogPage({ order: "top", cursor, limit: CATALOG_PAGE_MAX }, deps);
        if (!page.ok) throw new Error(`catalog table unavailable (${page.reason})`);
        for (const row of page.rows) apps.push(appFromCatalogRow(row));
        cursor = page.nextCursor ?? undefined;
      } while (cursor && apps.length < MAX_TABLE_APPS);
      return apps;
    },
  };
}
