/**
 * Catalog-table row mapping — leaf `5.l.ii.zi`, reduced by leaf `5.l.xix.zi`.
 *
 * `appFromCatalogRow` turns one `catalog_app` list row into a list-grade `App`, and
 * `catalogTableConfigured` says whether table mode is on. The `CatalogSource` that used to read the
 * whole table by following `nextCursor` (`createCatalogTableSource`, capped by `MAX_TABLE_APPS`) is
 * gone: every list, shelf, count, lookup and sitemap reads a bounded page instead.
 *
 * What a row can and cannot fill (list-grade `App`, honest about the rest):
 * - From the row: id, slug, name, summary, icon, version, app_type, category, developer, license,
 *   size, download link, created/updated, and Aptoide's reported downloads (as
 *   `third_party_stats.downloads`).
 * - NOT in a list row (needs `raw`, which `catalog_page` never returns): the long description,
 *   screenshots, permissions, changelog, rating, content rating, min Android version, version
 *   history, scan rank. They get the same neutral placeholders `normalizeAptoideApp` uses, and
 *   `not_provided` says so for the fields that have a "Not provided" path. The app detail page does
 *   NOT use this list-grade app: since leaf 11 (`5.l.vi.zi`) `getAppBySlug` reads that one row WITH
 *   its `raw` (`lib/catalog-detail.ts`) and shows the full app. This list-grade shape is what lists,
 *   shelves and charts show, and what the detail page falls back to for a row whose `raw` cannot be
 *   read.
 */

import type { App, NotProvidedField } from "../mock-data";
import { ALL_REGIONS } from "../mock-data";
import { isCatalogTableConfigured, type CatalogRow } from "../catalog-table";

/**
 * True when the Supabase env is usable, which is the only thing that switches table mode on
 * (leaf `5.l.xvii.zi`). The `CATALOG_SOURCE` variable this used to require is no longer read:
 * whatever it is set to, including `snapshot`, is ignored. Without the env the catalog pages show
 * first-party apps and the unavailable notice (`5.l.xx.zo` to `5.l.xxi.zo`). Leaf `5.l.xix.zi`
 * removed the old name `useCatalogTable`.
 */
export function catalogTableConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return isCatalogTableConfigured(env);
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
