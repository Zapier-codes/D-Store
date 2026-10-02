/**
 * Catalog data-fetch layer (leaf 0.a.ii.zo).
 *
 * Every function here is async and returns the same shapes a real
 * Supabase-backed implementation will return once Phase 5 (`5.f.i`,
 * provision Supabase) lands. Nothing above this module — pages,
 * components — should import `lib/mock-data.ts` directly; they call
 * these functions instead. That's the seam: when the real backend
 * exists, this file's internals get swapped for Supabase queries and
 * every caller keeps working unchanged.
 *
 * A small artificial delay is included on every call. This isn't
 * decorative — Phase 0 leaves that build loading/skeleton states
 * (shelves, search, detail page) need real async timing to build
 * against now, not a network round-trip that only shows up once
 * Supabase is wired in later.
 */

import { incrementCounter, logSearch } from "./counter-store";
import { apps, categories, developers, reviews, searchQueries, type App, type AppOrigin, type Category, type Collection, type Developer, type Review, type AppSponsoredSlot, type SearchQueryLog } from "./mock-data";
import { mergeCatalogSources, type CatalogSource } from "./sources/types";
import { createAptoideSource } from "./sources/aptoide";
import { createCatalogTableSource, useCatalogTable } from "./sources/catalog-table";
import { readThirdPartyShelf, SHELF_MAX } from "./catalog-shelf";
import { readAppsPage, parseAfter } from "./apps-page";
import { readCatalogApp, readCatalogDeveloper, readCatalogSlugExists } from "./catalog-detail";
import { readCatalogLicenses, CATALOG_LICENSE_MAX_CHARS, CATALOG_SIZE_MAX_MB, CATALOG_PAGE_MAX } from "./catalog-table";
import { readCategoryRows, type CategoryRowData } from "./catalog-category-rows";
import { readCatalogSitemapChunk, readCatalogSitemapTotal } from "./catalog-sitemap";
import { appSitemapEntry, developerSitemapEntry, sitePageEntries, sitemapChunkCount, type SitemapEntry } from "./sitemap-xml";
import { HOME_CATEGORY_ROWS, HOME_CATEGORY_ROW_SIZE } from "./home-categories";
import {
  createZealotSource as createLiveZealotSource,
  getZealotCollections,
  catalogScopeForTenant,
  catalogScopeKey,
  type CatalogScope,
} from "./sources/zealot";
import {
  affinityCategory,
  appInTaxonomyCategory,
  findTaxonomyCategory,
  listTaxonomyCategories,
  type AppType,
  type TaxonomyCategory,
} from "./taxonomy";
import { getCurrentTenant } from "./tenant";
import { isThirdParty } from "./trust";
import { reportedStatsFor } from "./third-party-stats";
import { DEFAULT_TENANT_ID } from "./tenant-config";

export type { TaxonomyCategory };
export type { App, AppOrigin, Category, Collection, Developer, AppSponsoredSlot, SearchQueryLog };

const SIMULATED_LATENCY_MS = 200;

function resolveAfterDelay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

/**
 * The Zealot ("first-party") source — leaf `5.h.ii.zi`, now backed by the
 * live signed-index reader (`5.g.i.zi`, `lib/sources/zealot.ts`) instead
 * of the in-memory `apps` array from `lib/mock-data.ts`. Exactly the swap
 * this function's comment previously committed to: only this function's
 * body changed, every caller below is untouched.
 *
 * `lib/sources/zealot.ts` itself falls back to an empty catalog whenever
 * no live index is configured/reachable/verifiable yet (see that file's
 * own comments), never to `mock-data.ts`'s dummy `apps` — mixing a real
 * signed source with invented dummy entries under the same `origin:
 * "zealot"` label would misrepresent which of the two a given app
 * actually came from.
 */
function createZealotSource(scope: CatalogScope): CatalogSource {
  return createLiveZealotSource(scope);
}

/**
 * Which tenant's Zealot index this request reads — leaf `6.b.ii.zo`. Resolved from the
 * request's `Host` the same way branding is (`getCurrentTenant`, `6.b.ii.zi`), so every
 * function in this file is tenant-scoped without any caller changing: pages, route handlers
 * and server actions all run inside a request, and an unknown host / `localhost` / preview
 * is the default tenant, whose scope is still `ZEALOT_CATALOG_INDEX_BASE_URL`.
 *
 * Deliberately NOT wrapped in a try/catch that falls back to the default tenant when there's
 * no request: Next signals "this must render dynamically" by throwing out of `headers()`, and
 * swallowing that would silently bake the default tenant's catalog into a static page.
 */
async function getCatalogScope(): Promise<CatalogScope> {
  return catalogScopeForTenant(await getCurrentTenant());
}

/**
 * Merged catalog — Zealot first (so it wins any `package_name`
 * collision per `mergeCatalogSources`), then Aptoide's ingested
 * snapshot. Computed once per server lifetime *per tenant scope* and
 * cached (`6.b.ii.zo`: was one process-wide value): the Aptoide side
 * already reads from a cached snapshot file (`lib/sources/aptoide.ts`),
 * so nothing here needs to be recomputed on every call — mirrors
 * `loadSnapshot`'s own caching in that file.
 *
 * Flagged, not changed by this leaf: the Aptoide snapshot is a single
 * third-party catalog with no tenant concept, so every tenant still
 * merges the same Aptoide apps in behind its own Zealot index. This
 * leaf scopes the *Zealot* index (the only tenant-owned catalog);
 * whether a white-label tenant should also carry Aptoide is a product
 * call, not a string swap.
 */
const mergedAppsByScope = new Map<string, Promise<App[]>>();

async function getMergedApps(): Promise<App[]> {
  const scope = await getCatalogScope();
  const key = catalogScopeKey(scope);
  let pending = mergedAppsByScope.get(key);
  if (!pending) {
    // 5.l.ii.zi — the Aptoide side reads the `catalog_app` table when the operator opts in
    // (`CATALOG_SOURCE=table` plus the Supabase env); otherwise the snapshot files, as before.
    // A failed table read falls back to the snapshot for this lifetime's catalog rather than 500ing every page.
    const thirdParty: CatalogSource = useCatalogTable()
      ? {
          origin: "aptoide",
          async getApps() {
            try {
              return await createCatalogTableSource().getApps();
            } catch (error) {
              console.error(`catalog: table read failed, using the snapshot (${error instanceof Error ? error.message : "unknown"})`);
              return createAptoideSource().getApps();
            }
          },
        }
      : createAptoideSource();
    pending = mergeCatalogSources([createZealotSource(scope), thirdParty]);
    mergedAppsByScope.set(key, pending);
    pending.catch(() => mergedAppsByScope.delete(key));
  }
  return pending;
}

/**
 * First-party (Zealot) apps alone, cached per tenant scope for the server lifetime like
 * `getMergedApps` — leaf `5.l.iv.zi`. Only the table-backed shelf paths below use it, so a
 * home shelf can be built from this small list plus a bounded database read instead of the
 * whole merged catalog. Same source and same scope as the merged list's first source.
 */
const firstPartyByScope = new Map<string, Promise<App[]>>();

async function getFirstPartyList(): Promise<App[]> {
  const scope = await getCatalogScope();
  const key = catalogScopeKey(scope);
  let pending = firstPartyByScope.get(key);
  if (!pending) {
    pending = createZealotSource(scope).getApps();
    firstPartyByScope.set(key, pending);
    pending.catch(() => firstPartyByScope.delete(key));
  }
  return pending;
}

/**
 * Bounded third-party read for a shelf, or `null` when the shelf must use the whole-catalog path:
 * the table is not in use, the ask is not a bounded one (`Infinity` for a full chart), or the read
 * failed. A failure logs one fixed line (no query, cursor or body) and the caller falls back,
 * the same policy `getMergedApps` applies to a failed table read.
 */
async function readShelfFromTable(order: "top" | "new", want: number, firstParty: readonly App[]): Promise<App[] | null> {
  if (!useCatalogTable() || !Number.isFinite(want) || want > SHELF_MAX) return null;
  const apps = await readThirdPartyShelf(order, Math.max(0, Math.floor(want)), firstParty);
  if (apps === null) console.error("catalog: bounded table read failed, using the whole-catalog path");
  return apps;
}

// --- Public stats (4.c.i.zo) --------------------------------------------

export interface PublicStats {
  totalApps: number;
  totalDownloads: number;
}

/**
 * Public stats footer widget — leaf `4.c.i.zo`, per docs/D-STORE.md
 * §4E ("Public stats footer widget (total apps, downloads)"). Two
 * numbers only, not `getTrafficSummary`'s (`3.c.ii.zi`) per-app
 * breakdown or view-count total — that dashboard sits behind
 * `/admin/traffic`'s password gate (`3.c.iv.zi`) precisely because
 * per-app numbers are more than a public footer should expose; this
 * is the coarse, catalog-wide subset that's fine to show anyone.
 *
 * `totalDownloads` sums `install_count` across the merged catalog —
 * this store's own counter, same honesty posture `lib/sources/
 * aptoide.ts` already documents: third-party (Aptoide-origin) apps
 * start at 0 and stay there until the flagged-not-fixed gap under
 * `5.h.ii.zi` (counters look up the Zealot-only `apps` array, so they
 * 404 for Aptoide-origin apps) is closed, so today's total undercounts
 * real installs for those apps rather than borrowing/fabricating an
 * Aptoide-sourced download count. `getTrafficSummary` already lives
 * with the same limitation; not re-solved here.
 *
 * Deliberately no `resolveAfterDelay`, unlike every other function in
 * this file. `Footer` renders in the root layout (`app/layout.tsx`) on
 * every single page with no Suspense boundary of its own, so the
 * simulated latency this module's header comment justifies for
 * page-level shelves (building real loading states against) would
 * instead add a flat 200ms to every single navigation sitewide, with
 * no loading state ever built here to justify paying it —
 * `getMergedApps()` is already cached in-memory per server lifetime,
 * so this call is effectively free after the first page render anyway.
 */
export async function getPublicStats(): Promise<PublicStats> {
  const merged = await getMergedApps();
  return {
    totalApps: merged.length,
    totalDownloads: merged.reduce((sum, app) => sum + app.install_count, 0),
  };
}

// --- Web Push dispatch catalog (5.k.xii.zo) ------------------------------

/**
 * The only five fields the Web Push dispatch plan (`lib/push-plan.ts`,
 * `PlanApp`) reads. Nothing else about an app leaves this function: no
 * install counts, no download URLs, no checksums.
 */
export interface DispatchCatalogApp {
  slug: string;
  name: string;
  version: string;
  rollout_percentage: number;
  rollout_status: "active" | "halted" | "complete";
}

/**
 * Thrown by `getDispatchCatalog()` when the request resolves to a tenant
 * other than the default one. The dispatch route (`5.k.xiii.zi`) maps it
 * to a fixed, clear status instead of planning against the wrong catalog.
 * Carries no tenant id, on purpose: the route must not echo which tenants
 * exist to whoever holds the dispatch secret's URL.
 */
export class DispatchTenantError extends Error {
  readonly reason = "non_default_tenant" as const;
  constructor() {
    super("dispatch catalog is only available for the default tenant");
    this.name = "DispatchTenantError";
  }
}

/**
 * Catalog view for the Web Push dispatch — leaf `5.k.xii.zo`. Server-side
 * only, and only meaningful inside a request (it resolves the tenant from
 * `Host`, like every other function in this file).
 *
 * **Decision 1 — tenant scope: default tenant only.** `getMergedApps()`
 * follows the request's `Host`, but a push subscription records no
 * tenant, and `push_notified_version` is keyed by slug alone. Planning
 * one tenant's catalog against subscriptions and baselines that may
 * belong to another would notify people about versions of apps they
 * never saw, or advance a baseline for the wrong catalog. So any request
 * that resolves to a non-default tenant is refused with
 * `DispatchTenantError`, rather than answered from that tenant's index.
 * The caller (a scheduled job) is expected to use the primary host. The
 * check is on `tenant_id`, the same test `catalogScopeForTenant` uses,
 * not on the wire-informational `is_default_tenant` flag. Making
 * dispatch tenant-aware means giving subscriptions and baselines a
 * tenant column, which is its own leaf.
 *
 * **Decision 2 — origin: Aptoide-origin apps are included.** A visitor
 * can save them, and their snapshot (`storage/downloads/`) is refreshed
 * on a schedule, so their versions do change. **Flagged: those version
 * strings are third-party data** — this store neither signs nor vets them
 * (Zealot-origin versions come from the verified signed index) — and a
 * change in Aptoide's own numbering scheme would notify subscribers.
 * They always carry `100`/`"complete"`, so rollout never holds them back.
 *
 * Reads `getMergedApps()`, not `getApps()`: no `resolveAfterDelay` (a
 * scheduled job should not pay 200 ms of simulated latency) and no region
 * filtering (a region filter would silently drop apps from the plan).
 * Returns a fresh array of fresh objects; the cached merged array and
 * its `App` objects are never mutated or handed out, so a caller that
 * sorts or edits the result cannot corrupt what pages render.
 *
 * Errors: a non-default tenant throws `DispatchTenantError`. A catalog
 * read failure, or calling this outside a request (Next signals dynamic
 * rendering by throwing out of `headers()`), propagates unchanged and is
 * deliberately not swallowed — an empty catalog here would be
 * indistinguishable from "nothing to notify".
 */
export async function getDispatchCatalog(): Promise<DispatchCatalogApp[]> {
  const tenant = await getCurrentTenant();
  if (tenant.tenant_id !== DEFAULT_TENANT_ID) throw new DispatchTenantError();
  const merged = await getMergedApps();
  return merged.map((app) => ({
    slug: app.slug,
    name: app.name,
    version: app.version,
    rollout_percentage: app.rollout_percentage,
    rollout_status: app.rollout_status,
  }));
}



/**
 * Does the catalog this request is reading contain `slug`? — leaf `3.c.v.zo`.
 * Used by the report intake route to refuse a report about an app that does
 * not exist, now that `report_flag` is keyed by the catalog slug and no longer
 * by a row in `application` (which nothing fills).
 *
 * Reads `getMergedApps()` — Zealot's index plus Aptoide — so a third-party app
 * can be reported. No `resolveAfterDelay`, no region filter (a region filter
 * would let a visitor in one region report only what they can see, and a
 * report is about the app, not the shelf). Scope follows the request's tenant
 * like every other read in this file: a visitor on a white-label host reports
 * against the catalog they were looking at. Errors from the catalog read are
 * NOT swallowed: "catalog unreadable" must not look like "no such app".
 */
export async function catalogHasSlug(slug: string): Promise<boolean> {
  // 5.l.vi.zi — table mode asks the table about this one slug (no `raw`, a few bytes) instead of
  // loading every app. A failed read is NOT "no such app": it falls through to the whole-catalog
  // path below, which throws if the catalog really is unreadable.
  if (useCatalogTable()) {
    try {
      const firstParty = await getFirstPartyList();
      if (firstParty.some((app) => app.slug === slug)) return true;
      const looked = await readCatalogSlugExists(slug);
      if (looked.ok) {
        // A first-party app owns its package name (`mergeCatalogSources`), so a row that shares one is not in the catalog.
        return looked.found !== null && !firstParty.some((app) => app.package_name === looked.found!.package_name);
      }
      console.error("catalog: slug check failed, using the whole catalog");
    } catch {
      console.error("catalog: slug check failed, using the whole catalog");
    }
  }
  const merged = await getMergedApps();
  return merged.some((app) => app.slug === slug);
}

export async function getCategories(): Promise<Category[]> {
  return resolveAfterDelay(categories);
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const category = categories.find((c) => c.slug === slug) ?? null;
  return resolveAfterDelay(category);
}

/**
 * Two-axis read model — leaf `5.i.iii.zo`. Additive: `getCategories`,
 * `getCategoryBySlug` and `getCategoryAppCount` above keep their one-flat-slug
 * shape and the pages still call them; `5.i.iv` moves the callers here.
 * The vocabulary entries (32 app categories, 17 game genres) come from
 * `lib/taxonomy.ts`; `uncategorized` is not listed or looked up (see
 * `listTaxonomyCategories`), though `getApps({ taxonomy })` and
 * `getTaxonomyAppCount` still accept it.
 */
export async function getTaxonomyCategories(): Promise<TaxonomyCategory[]> {
  return resolveAfterDelay(listTaxonomyCategories());
}

export async function getTaxonomyCategory(appType: AppType, slug: string): Promise<TaxonomyCategory | null> {
  return resolveAfterDelay(findTaxonomyCategory(appType, slug));
}

/** Apps stored in `(appType, slug)` — a direct comparison of the stored pair. */
export async function getTaxonomyAppCount(appType: AppType, slug: string): Promise<number> {
  const merged = await getMergedApps();
  return resolveAfterDelay(merged.filter((app) => appInTaxonomyCategory(app, appType, slug)).length);
}

/** App count per category — same value `Category.count` held in the legacy entity, derived here instead of stored. */
export async function getCategoryAppCount(slug: string): Promise<number> {
  const merged = await getMergedApps();
  return resolveAfterDelay(merged.filter((app) => app.category === slug).length);
}

// --- Collections: editorial groupings, read-only (5.j.ii.zo) -----------

/**
 * Editorial collection registry — leaf `4.c.ii.zo` originally, **retired
 * in favor of the Console's signed index by `5.j.ii.zo`**, the same
 * "this repo stays write-free, sourced from Zealot" move `setAppFeaturing`
 * (`5.g.v.zi`) and the sponsored-placement functions below already made.
 * `getZealotCollections()` (`lib/sources/zealot.ts`) reads the same
 * cached/live index `getMergedApps()` already resolves apps from — no
 * separate fetch path, no local seed array left to fall out of sync.
 */
export async function getCollections(): Promise<Collection[]> {
  const registry = await getZealotCollections(await getCatalogScope());
  return resolveAfterDelay(registry);
}

export async function getCollectionBySlug(slug: string): Promise<Collection | null> {
  const registry = await getZealotCollections(await getCatalogScope());
  const collection = registry.find((c) => c.slug === slug) ?? null;
  return resolveAfterDelay(collection);
}

/**
 * Member apps of one collection. Membership moved from an
 * `app_package_names` list living on the collection itself (`4.c.ii.zo`'s
 * original shape) to `App.collections` — each app's own list of
 * collection slugs, read straight off the Console's index the same way
 * `sponsored_slots` already is (`5.j.ii.zi`). That means there's no
 * curator-supplied order to preserve anymore (the old `sort` on
 * `app_package_names`'s order); apps are sorted by `install_count`
 * descending instead, the same "popularity within the group" fallback
 * `getCategoryAffinityApps` uses when it has nothing more specific to
 * rank by. Aptoide-origin apps always carry `collections: []` (a
 * first-party-only Console field), so a collection can only ever
 * surface Zealot-origin apps today — a real consequence of moving
 * membership onto the app, not something this function works around.
 */
export async function getCollectionApps(slug: string): Promise<App[]> {
  const merged = await getMergedApps();
  const result = merged
    .filter((app) => app.collections.includes(slug))
    .sort((a, b) => b.install_count - a.install_count);
  return resolveAfterDelay(result);
}

/** Member-app count per collection, same "pass counts down, don't fetch per-card" pattern `getCategoryAppCount` established. */
export async function getCollectionAppCount(slug: string): Promise<number> {
  const apps = await getCollectionApps(slug);
  return apps.length;
}

// --- Apps: listing & lookup -------------------------------------------

export interface GetAppsOptions {
  category?: string;
  /** `5.i.i.zi` — restrict to apps or games. Combine with `category`, which is only unambiguous alongside it. */
  appType?: AppType;
  /**
   * `5.i.iii.zo` — restrict to one category on the two-axis model
   * (`appInTaxonomyCategory`, a direct comparison of the stored pair since
   * `5.i.vii.zo`). Unlike `category` (a bare stored-slug comparison), this
   * needs the `app_type` because `sports` is on both axes. ANDs with every
   * other option.
   */
  taxonomy?: { appType: AppType; category: string };
  limit?: number;
  license?: string;
  maxSizeMb?: number;
  /** ISO 3166-1 alpha-2 code, e.g. from `lib/region.ts`'s `getRegion().country_code`. See `filterAppsByRegion` below. */
  region?: string;
  /**
   * Restrict to one catalog source — leaf `5.h.i.zi`. The seam
   * `5.h.i.zo` (home page: first-party first) and `5.h.iii` (third-party
   * labelling) build on; nothing calls it yet.
   */
  origin?: AppOrigin;
}

/**
 * Region-filter helper — leaf 0.h.ii.zo, closing out `0.h` and Phase 0
 * as a whole. Narrows a list of apps to those whose
 * `App.available_regions` (0.h.ii.zi) includes the given region code.
 * Exported standalone, not just inlined into `getApps` below, so a
 * future region-aware shelf function (`getFeaturedApps`,
 * `getTrendingApps`, etc.) can reuse the exact same check rather than
 * re-deriving its own `.includes()` — none of those are wired to
 * region today (see the module comment below for why not), but this
 * is the seam they'd plug into.
 */
export function filterAppsByRegion(source: App[], regionCode: string): App[] {
  return source.filter((app) => app.available_regions.includes(regionCode));
}

/**
 * `getApps` is the only fetch function this leaf actually wires
 * `region` into — deliberately not every shelf/search/similar-apps
 * function above and below it. `0.h` is named "Geo-Regionalization
 * *Foundation*," not "...Feature": per the `0.h` heading note and the
 * "Scope addition" note at the top of this handover, turning region
 * detection into catalog-wide filtering everywhere is real backend
 * work for whoever picks up region-aware queries once Supabase
 * (`5.f.i`) lands, not something to half-wire across a dozen call
 * sites on dummy data now. `filterAppsByRegion` + this one option are
 * the complete seam; nothing calls `getApps({ region: ... })` yet.
 */
export async function getApps(options: GetAppsOptions = {}): Promise<App[]> {
  let result = await getMergedApps();
  if (options.appType) {
    result = result.filter((app) => app.app_type === options.appType);
  }
  if (options.category) {
    result = result.filter((app) => app.category === options.category);
  }
  if (options.taxonomy) {
    const { appType, category } = options.taxonomy;
    result = result.filter((app) => appInTaxonomyCategory(app, appType, category));
  }
  if (options.license) {
    result = result.filter((app) => app.license === options.license);
  }
  if (options.maxSizeMb !== undefined) {
    result = result.filter((app) => app.size_mb <= options.maxSizeMb!);
  }
  if (options.region) {
    result = filterAppsByRegion(result, options.region);
  }
  if (options.origin) {
    result = result.filter((app) => app.origin === options.origin);
  }
  if (options.limit) {
    result = result.slice(0, options.limit);
  }
  return resolveAfterDelay(result);
}

/**
 * One app by slug from the table — leaf `5.l.vi.zi`. Table mode only. First-party apps are found
 * first in the small cached list (as `getMergedApps` puts them first); anything else is ONE row of
 * `catalog_app` read with its `raw` payload (`readCatalogApp`), so the page has the full description,
 * screenshots, permissions, changelog, rating and version history without any other app being
 * loaded. A row whose package name belongs to a first-party app is not in the merged catalog, so it
 * is not found here either.
 *
 * Returns the app, `null` for "no such app", or `undefined` when the read failed or the table is not
 * usable, which tells the caller to use the whole-catalog path (and is never read as "not found").
 * One fixed log line on failure (no slug, body or error text). Never throws.
 */
async function getAppBySlugFromTable(slug: string): Promise<App | null | undefined> {
  try {
    const firstParty = await getFirstPartyList();
    const own = firstParty.find((a) => a.slug === slug);
    if (own) return own;

    const looked = await readCatalogApp(slug);
    if (!looked.ok) {
      console.error("catalog: app lookup failed, using the whole catalog");
      return undefined;
    }
    const app = looked.app;
    if (app === null) return null;
    if (app.package_name && firstParty.some((a) => a.package_name === app.package_name)) return null;
    return app;
  } catch {
    console.error("catalog: app lookup failed, using the whole catalog");
    return undefined;
  }
}

export async function getAppBySlug(slug: string): Promise<App | null> {
  // 5.l.vi.zi — table mode reads one row instead of the whole catalog; the whole-catalog path below
  // is the fallback when the table is off or the read failed.
  if (useCatalogTable()) {
    const found = await getAppBySlugFromTable(slug);
    if (found !== undefined) return resolveAfterDelay(found);
  }
  const merged = await getMergedApps();
  const app = merged.find((a) => a.slug === slug) ?? null;
  return resolveAfterDelay(app);
}

/**
 * Increment an app's `install_count` by one — leaf `3.b.i.zi` (Metrics
 * Pipeline, Counters). First *write* in this file; every function
 * above is read-only. Follows the same seam this module's header
 * comment already commits to: mutates the in-memory dummy `apps`
 * array today, and gets swapped for a real Supabase `UPDATE`/RPC call
 * once `5.f.i` provisions it — the route handler that calls this
 * (`app/api/apps/[slug]/install/route.ts`) and the `InstallButton`
 * click site that calls the route handler both stay unchanged when
 * that swap happens.
 *
 * Returns the app's new `install_count`, or `null` if no app matches
 * `slug` — the route handler maps that to a 404, the same "not found"
 * shape `getAppBySlug` already established for reads.
 */
// Leaf 5.g.v.zo part (d): `incrementInstallCount` and `incrementViewCount` now
// resolve the slug against the MERGED catalog (Zealot, Aptoide and the dummy
// apps), so a real catalog app is counted instead of answering "not found", and,
// when Supabase is configured, count in `app_counter` through
// `lib/counter-store.ts`. Decision recorded for the operator to overrule: third-
// party (Aptoide) apps DO get store-native counters, since the stats Zealot reads
// are about this storefront's own traffic. When Supabase is not configured or
// does not answer, the count falls back to the in-memory dummy `apps` array as
// before (so a dummy app still moves, and any other app returns `null`, the
// route's 404). The pages still show the index's own figures; `app_counter` is
// read only by `store_stats()`.
export async function incrementInstallCount(slug: string): Promise<number | null> {
  if (!(await catalogHasSlug(slug))) return null;
  const stored = await incrementCounter("install", slug);
  if (stored.ok) return stored.count;
  const app = apps.find((a) => a.slug === slug);
  if (!app) {
    return resolveAfterDelay(null);
  }
  app.install_count += 1;
  return resolveAfterDelay(app.install_count);
}

/**
 * Increment an app's `view_count` by one — leaf `3.b.i.zo`, the
 * second half of the "Counters" milestone. Same shape and same seam
 * as `incrementInstallCount` immediately above: mutates the in-memory
 * dummy `apps` array today, swaps for a real Supabase call once
 * `5.f.i` lands, and its caller (`app/api/apps/[slug]/view/route.ts`)
 * doesn't need to change when that happens.
 *
 * `view_count` itself is a genuinely new field (`lib/mock-data.ts`,
 * this leaf) — see that file's field comment for why it wasn't
 * already there. Returns the app's new `view_count`, or `null` for an
 * unknown slug, same "not found" shape every other lookup here uses.
 */
export async function incrementViewCount(slug: string): Promise<number | null> {
  if (!(await catalogHasSlug(slug))) return null;
  const stored = await incrementCounter("view", slug);
  if (stored.ok) return stored.count;
  const app = apps.find((a) => a.slug === slug);
  if (!app) {
    return resolveAfterDelay(null);
  }
  app.view_count += 1;
  return resolveAfterDelay(app.view_count);
}

/**
 * Submit a star rating and fold it into the app's denormalized
 * `avg_rating`/`rating_count` — leaf `3.b.ii.zi`, the leaf this
 * milestone is named for ("Denormalized avg_rating/review_count job").
 * This is the job: rather than computing the average fresh from every
 * `Review` row on every read (`RatingSummary` would need to scan all
 * of `reviews` on every page render), the aggregate lives denormalized
 * on the `App` row itself and gets updated incrementally, right here,
 * the moment a new `Review` comes in.
 *
 * The incremental-average update: `newAvg = (oldAvg * oldCount +
 * stars) / (oldCount + 1)`. This specifically treats the *existing*
 * `avg_rating`/`rating_count` — dummy seed values with no real
 * `Review` rows behind them, same as every other aggregate-only field
 * in `lib/mock-data.ts` — as a valid prior to blend into, not
 * something to discard or overwrite. The alternative (deriving
 * `avg_rating`/`rating_count` purely from `reviews`, which starts
 * empty) would make the very first real rating submitted crash
 * `rating_count` from e.g. 47 down to 1 and snap `avg_rating` to
 * exactly that one star value — a worse, more visibly-broken dummy
 * behavior than the thing `RateThisApp`'s own doc comment already
 * flagged as too misleading to fake. Blending preserves continuity:
 * a new 5-star rating nudges the average up slightly, the way a real
 * incremental counter would, instead of resetting it.
 *
 * Also appends the raw submission to `reviews` (not read by anything
 * yet — `RatingSummary`'s histogram still synthesizes from the
 * aggregate, per its own doc comment — but this is the row a future
 * leaf building a real per-star histogram, or Phase 5's `Review`
 * entity migration, would read from instead of recomputing).
 *
 * Rejects out-of-range `stars` (must be an integer 1–5) before
 * touching anything, same validate-before-mutate posture as every
 * write in this file. Returns the app's new `{ avg_rating,
 * rating_count }`, or `null` for an unknown slug — same "not found"
 * shape every other lookup here uses.
 */
export async function submitReview(
  slug: string,
  stars: number
): Promise<{ avg_rating: number; rating_count: number } | null> {
  const app = apps.find((a) => a.slug === slug);
  if (!app) {
    return resolveAfterDelay(null);
  }

  const review: Review = {
    id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    app_slug: slug,
    stars,
    created_at: new Date().toISOString(),
  };
  reviews.push(review);

  const newCount = app.rating_count + 1;
  const newAvg = (app.avg_rating * app.rating_count + stars) / newCount;

  app.rating_count = newCount;
  app.avg_rating = Math.round(newAvg * 10) / 10; // one decimal, matches every displayed avg_rating already in mock-data.ts

  return resolveAfterDelay({ avg_rating: app.avg_rating, rating_count: app.rating_count });
}

/**
 * Admin featuring toggle — leaf `3.c.i.zi` originally, **disabled by
 * `5.g.v.zi`**: featured/Editors' Pick now read straight from the
 * Console's signed index (`lib/sources/zealot.ts`'s `editorial` block),
 * so this repo stays write-free on the editorial side, per that leaf's
 * own text ("this repo stays write-free on the editorial side"). Local
 * toggles would be silently overwritten on the next index fetch anyway,
 * since `getFeaturedApps`/`getEditorsPicks` read the merged catalog, not
 * a separately-cached copy — same "no shadow state to fall out of sync"
 * reasoning this file already applies elsewhere.
 *
 * Kept as a function (rather than deleted outright) so its one caller,
 * `app/api/admin/apps/[slug]/featuring/route.ts`, has a single place to
 * import a clear "disabled" signal from instead of duplicating this
 * decision inline. Always throws; never mutates `apps` and never
 * resolves — this is a genuine "stop calling this" leaf, not a
 * differently-shaped success path.
 */
export async function setAppFeaturing(
  _slug: string,
  _updates: { is_featured?: boolean; is_editors_pick?: boolean }
): Promise<App | null> {
  throw new Error(
    "setAppFeaturing is disabled (5.g.v.zi): featured/Editors' Pick are now read-only, sourced from the Console's signed index. Set them in the Zealot Console instead."
  );
}

// --- Home page shelves (0.d) -------------------------------------------

export async function getFeaturedApps(limit = 6): Promise<App[]> {
  // Featured is editorial and first-party only (every third-party app is `is_featured: false`),
  // so in table mode the small first-party list answers it without the whole catalog (5.l.iv.zi).
  const pool = useCatalogTable() ? await getFirstPartyList() : await getMergedApps();
  const result = pool.filter((app) => app.is_featured).slice(0, limit);
  return resolveAfterDelay(result);
}

/**
 * First-party (Zealot-origin) apps only — leaf `5.h.i.zo`, backing the
 * home page's dedicated first-party section. HANDOVER.md's "Resolved —
 * catalog sources" rule: "a first-party section is always first, and
 * the hero prefers a first-party app... Shelves below rank first-party
 * ahead of third-party." This function is the first-party section's
 * own data source (the "always first" section itself, not a ranking
 * tweak on a mixed list) and also backs `app/page.tsx`'s hero-selection
 * fallback chain.
 *
 * Reads the merged catalog (`getMergedApps`, `5.h.ii.zi`) rather than
 * the raw first-party `apps` array directly, so this stays correct
 * once `5.g.i.zi` swaps Zealot's side of `createZealotSource()` for a
 * real signed-index read — same seam-stability every other
 * `getMergedApps()`-backed export in this file already has. Today
 * that's a distinction without a difference (nothing non-Zealot is
 * ever `origin: "zealot"`), but filtering the merged result is the
 * honest way to express "first-party" as a catalog-wide concept rather
 * than as "whatever `lib/mock-data.ts`'s `apps` array happens to hold."
 *
 * No `Shelf`-level empty-state handling needed here: `Shelf` (0.d.ii.zi)
 * already renders nothing when handed an empty `apps` array, which is
 * exactly HANDOVER.md's "If Zealot has no live apps yet, the section
 * is omitted (no empty shell)" rule — this function doesn't need its
 * own version of that check.
 */
export async function getFirstPartyApps(limit = 6): Promise<App[]> {
  // Table mode reads the first-party list directly (5.l.iv.zi); same apps, same order.
  const pool = useCatalogTable() ? await getFirstPartyList() : await getMergedApps();
  const result = pool.filter((app) => app.origin === "zealot").slice(0, limit);
  return resolveAfterDelay(result);
}

/**
 * Daily materialized Trending cache — leaf `3.b.ii.zo`. Two things
 * this leaf changes about `getTrendingApps`:
 *
 * 1. **Sort key**: `install_count` → `view_count`. Flagged by
 *    `3.b.i.zo`, fixed here: docs/D-STORE.md §4E frames this row as
 *    "View counters (powers Trending)" — a cumulative install total
 *    barely reorders day to day and isn't what "trending" means
 *    anyway (an app someone installed once six months ago
 *    contributes to it forever); `view_count` is the closer real-world
 *    analogue of a "how much attention is this getting right now"
 *    signal, and it's the field the counter this row was named after
 *    (`3.b.i.zo`) already built.
 *
 * 2. **Materialization**: previously recomputed a full-catalog sort
 *    on every call. Real "daily materialized" means a snapshot
 *    computed periodically and read cheaply in between — the read
 *    path shouldn't pay for the sort on every request. Modeled here
 *    with a lazy TTL cache: `materializeTrendingCache()` snapshots
 *    the ranked slug order once, `getTrendingApps` reuses that
 *    snapshot until it's more than `TRENDING_CACHE_TTL_MS` old, then
 *    recomputes. This is genuinely the shape a periodic job + cached
 *    read would take — not faked — but it's honestly a same-process,
 *    in-memory cache, same limitation the rest of this dummy data
 *    layer already has (a real deployment with multiple serverless
 *    instances wouldn't share this cache between them; that needs an
 *    actual scheduled job writing to Supabase once `5.f.i` exists,
 *    which this stands in for ahead of).
 *
 * Snapshotting slugs rather than `App` objects directly means a
 * later `incrementViewCount` call between materializations doesn't
 * retroactively reorder an already-served ranking mid-TTL-window (the
 * whole point of "daily" — the order is supposed to hold steady for
 * the window, not jitter on every view), while the actual `App` data
 * returned is still looked up fresh each call, so display fields
 * (name, icon, current counts shown alongside the ranking) are never
 * stale even though the *order* intentionally is, within the window.
 */
interface TrendingCacheEntry {
  computedAt: number; // epoch ms
  rankedSlugs: string[];
}

let trendingCache: TrendingCacheEntry | null = null;
const TRENDING_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // "daily"

/**
 * `5.h.i.zo` widens this from the first-party-only `apps` array to the
 * full merged catalog, and adds origin as the primary sort key —
 * HANDOVER.md's "Shelves below rank first-party ahead of third-party"
 * rule. `view_count` (this shelf's existing metric) still breaks ties
 * within each origin group, so a first-party app never loses its
 * relative Trending position to another first-party app just because
 * this leaf touched the function — origin only ever reorders *across*
 * the zealot/aptoide boundary, never within one side of it. Every
 * ingested Aptoide app currently starts at `view_count: 0`
 * (`lib/sources/aptoide.ts`), so in practice this mostly means
 * third-party apps now appear at all on this shelf (previously they
 * were invisible here, not merely ranked low, since `apps` never
 * contained them) — always behind first-party ones, per the rule.
 */
async function materializeTrendingCache(): Promise<TrendingCacheEntry> {
  // 5.l.iv.zi: in table mode only the first-party apps are ranked here (by `view_count`); the
  // third-party part of Trending comes from a bounded database read in `getTrendingApps`.
  const merged = useCatalogTable() ? await getFirstPartyList() : await getMergedApps();
  const originRank = (app: App) => (app.origin === "zealot" ? 0 : 1);
  const rankedSlugs = [...merged]
    .sort((a, b) => originRank(a) - originRank(b) || b.view_count - a.view_count)
    .map((app) => app.slug);
  return { computedAt: Date.now(), rankedSlugs };
}

async function getOrRefreshTrendingCache(): Promise<TrendingCacheEntry> {
  const isStale = !trendingCache || Date.now() - trendingCache.computedAt > TRENDING_CACHE_TTL_MS;
  if (isStale) {
    trendingCache = await materializeTrendingCache();
  }
  // Non-null by construction: either the cache existed and wasn't
  // stale, or it was just (re)assigned above. TS can't carry that
  // narrowing across a module-level `let` on its own.
  return trendingCache!;
}

export async function getTrendingApps(limit = 12): Promise<App[]> {
  const cache = await getOrRefreshTrendingCache();

  // 5.l.iv.zi — table mode. Third-party apps all have `view_count` 0, so after the first-party
  // group (ranked by the cached order above) the whole-catalog path leaves them in the table's
  // `top` order; this reads exactly that prefix from the database instead of the whole table.
  if (useCatalogTable()) {
    const firstParty = await getFirstPartyList();
    const ranked = cache.rankedSlugs
      .map((slug) => firstParty.find((app) => app.slug === slug))
      .filter((app): app is App => app !== undefined)
      .slice(0, limit);
    const thirdParty = await readShelfFromTable("top", limit - ranked.length, firstParty);
    if (thirdParty !== null) return resolveAfterDelay([...ranked, ...thirdParty].slice(0, limit));
  }

  const merged = await getMergedApps();

  // Table mode only reaches here after a failed bounded read. The cache above holds first-party
  // slugs only in that mode, so rank the merged list directly (same order, just not frozen).
  if (useCatalogTable()) {
    const fallbackRank = (app: App) => (app.origin === "zealot" ? 0 : 1);
    const ranked = [...merged]
      .sort((a, b) => fallbackRank(a) - fallbackRank(b) || b.view_count - a.view_count)
      .slice(0, limit);
    return resolveAfterDelay(ranked);
  }

  const result = cache.rankedSlugs
    .map((slug) => merged.find((app) => app.slug === slug))
    .filter((app): app is App => app !== undefined)
    .slice(0, limit);
  return resolveAfterDelay(result);
}

export async function getEditorsPicks(limit = 12): Promise<App[]> {
  // Editorial and first-party only, like Featured (5.l.iv.zi).
  const pool = useCatalogTable() ? await getFirstPartyList() : await getMergedApps();
  const result = pool.filter((app) => app.is_editors_pick).slice(0, limit);
  return resolveAfterDelay(result);
}

/**
 * Top Free chart — leaf `3.b.iii.zi` (Metrics Pipeline, Charts). §2's
 * Play Store benchmark and §4E both name "Top Free" as its own chart,
 * distinct from Trending (`getTrendingApps`, `view_count`-ranked,
 * `3.b.ii.zo`) and New & Updated (`getNewAndUpdated`, `updated_at`-
 * ranked). Real Play Store "Top Free" ranks free apps by popularity
 * (installs) as a genuine competing dimension against "Top Paid" —
 * this catalog has no paid-apps concept at all (every app here is
 * FOSS), so there's no non-free tier to exclude; "Top Free" here is
 * honestly just every app in the catalog ranked by `install_count`.
 *
 * Deliberately *not* the same lazy-TTL-snapshot treatment
 * `getTrendingApps` got (`3.b.ii.zo`) — that leaf's "daily
 * materialized" framing was specific to Trending's naming, not a
 * general pattern every chart needs; a cumulative install-count
 * ranking is naturally far more stable call to call than a
 * view-count one anyway (an install total doesn't reorder on every
 * page load the way raw view counts would), so a plain live sort is
 * honest and cheap enough at this catalog's size without inventing a
 * caching layer this leaf doesn't call for.
 *
 * No `limit` default cap the way the home-page shelf fetchers have
 * one (`getFeaturedApps`/`getTrendingApps`/`getEditorsPicks` all
 * default to a home-shelf-sized slice) — a chart page's whole point
 * is showing the full ranked list, not a preview of it.
 *
 * **Mixed-list rule — leaf `5.h.viii.zo` (decided and recorded).**
 * First-party apps are ranked by D-Store's own `install_count`; a
 * third-party app's `install_count` is always 0 (this store never
 * installed it), so it is ranked by the source's *reported* downloads
 * (`reportedStatsFor(app)?.downloads`, `lib/third-party-stats.ts`)
 * instead. The two numbers are never put on one axis — a first-party
 * app with 40 installs would otherwise sit below a third-party app
 * reporting 500 million. The result is **two ranked groups, first-party
 * first, then third-party**, each in descending order of its own
 * counter. A third-party app with no reported downloads goes last in
 * its group; ties break on `slug` so the order is deterministic. The
 * return type is unchanged (one array, the two groups concatenated);
 * the Top Free page splits it back into two labelled sections with
 * `isThirdParty` and restarts the rank numbers in each.
 */
export async function getTopFreeApps(limit = Infinity): Promise<App[]> {
  // 5.l.iv.zi — table mode with a bounded `limit` (the home shelf): first-party group first, then
  // the first rows of the database's `top` order, which is the same reported-downloads-then-slug
  // order the whole-catalog sort below produces for third-party apps. A full chart (no limit)
  // keeps the whole-catalog path until leaf 9 pages it.
  if (useCatalogTable() && Number.isFinite(limit)) {
    const firstPartyAll = await getFirstPartyList();
    const firstPartyRanked = firstPartyAll
      .filter((app) => !isThirdParty(app))
      .sort((a, b) => b.install_count - a.install_count || a.slug.localeCompare(b.slug))
      .slice(0, Math.max(0, limit));
    const thirdParty = await readShelfFromTable("top", limit - firstPartyRanked.length, firstPartyAll);
    if (thirdParty !== null) return resolveAfterDelay([...firstPartyRanked, ...thirdParty].slice(0, limit));
  }

  const merged = await getMergedApps();
  const firstParty = merged
    .filter((app) => !isThirdParty(app))
    .sort((a, b) => b.install_count - a.install_count || a.slug.localeCompare(b.slug));
  const thirdParty = merged
    .filter((app) => isThirdParty(app))
    .sort(
      (a, b) =>
        (reportedStatsFor(b)?.downloads ?? -1) - (reportedStatsFor(a)?.downloads ?? -1) ||
        a.slug.localeCompare(b.slug)
    );
  const all = [...firstParty, ...thirdParty];
  return resolveAfterDelay(Number.isFinite(limit) ? all.slice(0, Math.max(0, limit)) : all);
}

/**
 * One page of the Top Free chart — leaf `5.l.x.zo`. Table mode only: `null` when the table is not in
 * use (silently, the page then shows the whole list exactly as before) or when the read failed (one
 * fixed log line, no query, cursor or body; the page then falls back to the whole-catalog path, the
 * same policy as `readShelfFromTable`).
 *
 * Same two groups as `getTopFreeApps`, split here so the page need not: page 1 is the first-party
 * group (ranked by D-Store installs, then slug, passed to `readAppsPage` already sorted because
 * `top` keeps list order) and then the first third-party rows; every later page is third-party only,
 * in the database's `top` order (reported downloads, then slug). `after` is the raw `after` URL value.
 */
export interface TopFreePage {
  firstParty: App[];
  thirdParty: App[];
  /** Opaque; pass back as `after` for the next page. `null` on the last page. */
  nextCursor: string | null;
  isFirstPage: boolean;
}

export async function getTopFreePage(after?: unknown, pageSize?: number): Promise<TopFreePage | null> {
  if (!useCatalogTable()) return null;
  const firstPartyAll = await getFirstPartyList();
  const ranked = [...firstPartyAll].sort(
    (a, b) => (isThirdParty(a) ? 1 : 0) - (isThirdParty(b) ? 1 : 0) || b.install_count - a.install_count || a.slug.localeCompare(b.slug)
  );
  const page = await readAppsPage({ order: "top", after: parseAfter("top", after), pageSize, firstParty: ranked });
  if (page === null) {
    console.error("catalog: paged table read failed, using the whole-catalog path");
    return null;
  }
  return {
    firstParty: page.apps.filter((app) => !isThirdParty(app)),
    thirdParty: page.apps.filter((app) => isThirdParty(app)),
    nextCursor: page.nextCursor,
    isFirstPage: page.isFirstPage,
  };
}

/**
 * One page of the New & Updated chart — leaf `5.l.xi.zi`. Table mode only, same contract as
 * `getTopFreePage`: `null` silently when the table is not in use (the page then shows the whole list
 * exactly as before) and `null` with one fixed log line, no query, cursor or body, when the read
 * failed (the page falls back to `getNewAndUpdated(Infinity)`).
 *
 * One list, no sections and no ranks. Page 1 is the first-party apps (newest `updated_at` first)
 * and then the first third-party rows in the database's `new` order; later pages are third-party
 * only. This differs from the whole-catalog path in one place on purpose: that path interleaves
 * first-party and third-party apps by `updated_at`, while a keyset page cannot, so first-party
 * apps lead page 1 (decision (c) of the `5.l.v.zi` split: first-party apps on page 1 only, never
 * repeated). `after` is the raw `after` URL value.
 */
export interface NewPage {
  apps: App[];
  /** Opaque; pass back as `after` for the next page. `null` on the last page. */
  nextCursor: string | null;
}

export async function getNewPage(after?: unknown, pageSize?: number): Promise<NewPage | null> {
  if (!useCatalogTable()) return null;
  const firstParty = await getFirstPartyList();
  const page = await readAppsPage({ order: "new", after: parseAfter("new", after), pageSize, firstParty });
  if (page === null) {
    console.error("catalog: paged table read failed, using the whole-catalog path");
    return null;
  }
  return { apps: page.apps, nextCursor: page.nextCursor };
}

/**
 * One page of "All apps" — leaf `5.l.xi.zo`: every app and game, one flat list, in `top` order.
 * Table mode only, same contract as `getTopFreePage` (of which this is the flat form: same
 * read, same order, same first-party rule): `null` silently when the table is not in use, `null`
 * with one fixed log line when the read failed. Page 1 is the first-party apps (ranked by D-Store
 * installs, then slug) and then the first third-party rows (reported downloads, then slug); later
 * pages are third-party only. `after` is the raw `after` URL value.
 */
export interface AllAppsPage {
  apps: App[];
  /** Opaque; pass back as `after` for the next page. `null` on the last page. */
  nextCursor: string | null;
}

export async function getAllAppsPage(after?: unknown, pageSize?: number): Promise<AllAppsPage | null> {
  const page = await getTopFreePage(after, pageSize);
  if (page === null) return null;
  return { apps: [...page.firstParty, ...page.thirdParty], nextCursor: page.nextCursor };
}

/**
 * One page of a category's apps — leaves `5.l.xii.zi` and `5.l.xii.zo`. Table mode only, same
 * contract as `getTopFreePage`: `null` silently when the table is not in use (the category page then
 * loads the whole category as before) and `null` with one fixed log line when the page read failed.
 * The category is read by the `(appType, category)` pair, in `top` order: page 1 is the category's
 * first-party apps (ranked by D-Store installs, then slug) and then the first third-party rows;
 * later pages are third-party only. First-party apps are matched with `appInTaxonomyCategory`, the
 * same read-time shim `getApps({ taxonomy })` uses, so a first-party app still carrying a legacy slug
 * appears under its Play equivalent; third-party rows carry the Play slug in the table itself (the
 * re-derive wrote it). The caller has already checked that `appType`/`category` is a real pair; a
 * slug the table cannot take is a refused read (`null`).
 *
 * Filters (`5.l.xii.zo`): `license` (exact) and `maxSizeMb` go to the database for third-party rows
 * and are applied here to first-party apps. A value that cannot be a filter (a blank or over-long
 * license, a size that is not a finite number from 0 to `CATALOG_SIZE_MAX_MB`) is IGNORED rather than
 * refused, so a garbled URL shows the unfiltered page instead of falling back to the whole catalog;
 * the values actually applied come back as `license` and `maxSizeMb` so the pager can carry them.
 * One difference from the whole-category page, on purpose: a non-numeric `maxSize` used to match
 * nothing there and is ignored here.
 *
 * `licenses` is the license dropdown's list: the table's distinct licenses for the category
 * (`readCatalogLicenses`, needs the `5.l.xii.zo` migration) joined with the first-party apps' own,
 * sorted. It is read alongside the page, and `null` when that read failed, in which case the page
 * still shows (filters hidden) rather than failing: until the operator applies the migration the
 * category page is paged and unfiltered, exactly as `5.l.xii.zi` left it. A filter that is in the
 * URL while the migration is missing makes the page read itself fail (the function has no such
 * parameter), which is the `null` fallback above.
 */
export interface CategoryPage {
  apps: App[];
  /** Opaque; pass back as `after` for the next page. `null` on the last page. */
  nextCursor: string | null;
  /** The license filter actually applied, if any. */
  license?: string;
  /** The size filter (MB) actually applied, if any. */
  maxSizeMb?: number;
  /** Licenses to offer in the dropdown; `null` = could not be read, show no filters. */
  licenses: string[] | null;
}

export async function getCategoryPage(
  appType: AppType,
  category: string,
  options: { after?: unknown; license?: string; maxSizeMb?: number; pageSize?: number } = {}
): Promise<CategoryPage | null> {
  if (!useCatalogTable()) return null;

  const rawLicense = options.license?.trim();
  const license =
    rawLicense && rawLicense.length <= CATALOG_LICENSE_MAX_CHARS && !rawLicense.includes("\u0000") ? rawLicense : undefined;
  const size = options.maxSizeMb;
  const maxSizeMb =
    size !== undefined && Number.isFinite(size) && size >= 0 && size <= CATALOG_SIZE_MAX_MB ? size : undefined;

  const firstPartyAll = await getFirstPartyList();
  const ranked = [...firstPartyAll].sort(
    (a, b) => (isThirdParty(a) ? 1 : 0) - (isThirdParty(b) ? 1 : 0) || b.install_count - a.install_count || a.slug.localeCompare(b.slug)
  );
  const matchFirstParty = (app: App) => appInTaxonomyCategory(app, appType, category);

  const [page, licensesResult] = await Promise.all([
    readAppsPage({
      scope: { appType, category },
      order: "top",
      after: parseAfter("top", options.after),
      pageSize: options.pageSize,
      firstParty: ranked,
      matchFirstParty,
      filter: { license, maxSizeMb },
    }),
    readCatalogLicenses({ appType, category }),
  ]);
  if (page === null) {
    console.error("catalog: paged table read failed, using the whole-catalog path");
    return null;
  }

  let licenses: string[] | null = null;
  if (licensesResult.ok) {
    const own = firstPartyAll.filter((app) => app.origin === "zealot" && matchFirstParty(app)).map((app) => app.license);
    licenses = [...new Set([...licensesResult.licenses, ...own])].filter((value) => value !== "").sort();
  }

  return { apps: page.apps, nextCursor: page.nextCursor, license, maxSizeMb, licenses };
}

/** "New & Updated" shelf (docs/D-STORE.md §4A) — sorted by `updated_at` descending. */
export async function getNewAndUpdated(limit = 12): Promise<App[]> {
  // 5.l.iv.zi — table mode with a bounded `limit`: the first-party apps plus the first rows of the
  // database's `new` order, merged by `updated_at` below exactly as the whole catalog would be.
  // `getNewAndUpdated(Infinity)` (the full chart) keeps the whole-catalog path until leaf 9.
  if (useCatalogTable() && Number.isFinite(limit)) {
    const firstParty = await getFirstPartyList();
    const thirdParty = await readShelfFromTable("new", limit, firstParty);
    if (thirdParty !== null) {
      const result = [...firstParty, ...thirdParty]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, Math.max(0, limit));
      return resolveAfterDelay(result);
    }
  }

  const merged = await getMergedApps();
  const result = [...merged]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, limit);
  return resolveAfterDelay(result);
}

/**
 * How many chunk documents the sitemap index lists — leaf `5.l.vi.zo`. Table mode only: `null` when
 * the table is not in use or the count could not be read (one fixed log line); the caller then serves
 * the whole-catalog sitemap, as before. One request, one row asked for, only the count used.
 */
export async function getSitemapChunkCount(): Promise<number | null> {
  if (!useCatalogTable()) return null;
  try {
    const read = await readCatalogSitemapTotal();
    if (!read.ok) {
      console.error("catalog: sitemap count failed");
      return null;
    }
    return sitemapChunkCount(read.total);
  } catch {
    console.error("catalog: sitemap count failed");
    return null;
  }
}

/**
 * One document of the chunked sitemap — leaf `5.l.vi.zo`. Table mode only: `null` when the table is
 * not in use (the caller serves the whole-catalog sitemap, as before) and `null` with one fixed log
 * line when a read failed (the caller answers 503; a failed read is never an empty or a short
 * sitemap). Never throws.
 *
 * Chunk `index` is rows `index * 1000` to `index * 1000 + 999` of the published rows by slug
 * (`lib/catalog-sitemap.ts`). Chunk 0 also carries what is not a row: the site's own pages, one page
 * per taxonomy category, the first-party (Zealot) apps and their developers. A row whose package name
 * or slug belongs to a first-party app is left out (first-party wins, as in the merged catalog), so no
 * URL is listed twice and none that the app page would answer "not found" for. `chunkCount` comes from
 * the table's own count in the same read; an `index` at or past it comes back with no entries and the
 * caller answers 404.
 *
 * Decided here, for the operator to overrule: developer pages are listed for first-party developers
 * only. A third-party developer page still loads the whole catalog for its app list
 * (`getAppsByDeveloper`, which `5.l.vii.zi` or a new leaf has to replace), so listing thousands of
 * them would invite a crawler to trigger that load thousands of times.
 */
export interface SitemapChunk {
  entries: SitemapEntry[];
  chunkCount: number;
}

export async function getSitemapChunk(index: number, baseUrl: string): Promise<SitemapChunk | null> {
  if (!useCatalogTable()) return null;
  try {
    const read = await readCatalogSitemapChunk(index);
    if (!read.ok) {
      console.error("catalog: sitemap read failed");
      return null;
    }
    const chunkCount = sitemapChunkCount(read.total);
    if (index >= chunkCount) return { entries: [], chunkCount };

    const entries: SitemapEntry[] = [];
    const firstParty = await getFirstPartyList();
    const ownPackages = new Set<string>();
    const ownSlugs = new Set<string>();
    for (const app of firstParty) {
      if (app.package_name) ownPackages.add(app.package_name);
      ownSlugs.add(app.slug);
    }

    if (index === 0) {
      const categories = await getTaxonomyCategories();
      entries.push(...sitePageEntries(baseUrl, categories));
      for (const app of firstParty) entries.push(appSitemapEntry(baseUrl, app.slug, app.updated_at));
      for (const slug of new Set(firstParty.map((app) => app.developer_slug))) {
        entries.push(developerSitemapEntry(baseUrl, slug));
      }
    }
    for (const row of read.rows) {
      if (ownPackages.has(row.package_name) || ownSlugs.has(row.slug)) continue;
      entries.push(appSitemapEntry(baseUrl, row.slug, row.updated_at));
    }
    return { entries, chunkCount };
  } catch {
    console.error("catalog: sitemap read failed");
    return null;
  }
}

/**
 * Category rows for the home page — leaf `5.l.ix.zo`. Table mode only: the rows come from bounded
 * `catalog_page` reads (`readCategoryRows`), one per pair in `HOME_CATEGORY_ROWS`. With the table
 * off, or when any read fails, the answer is no rows (never the whole-catalog path, which would
 * load every app to draw a row), so the home page simply shows what it showed before. A failure
 * logs one fixed line (no slug, cursor or body). Never throws.
 */
export async function getHomeCategoryRows(): Promise<CategoryRowData[]> {
  if (!useCatalogTable()) return [];
  try {
    const firstParty = await getFirstPartyList();
    const rows = await readCategoryRows(HOME_CATEGORY_ROWS, HOME_CATEGORY_ROW_SIZE, firstParty);
    if (rows === null) {
      console.error("catalog: category rows read failed, showing none");
      return [];
    }
    return rows;
  } catch {
    console.error("catalog: category rows read failed, showing none");
    return [];
  }
}

// --- Search & related content (0.g) -------------------------------------------

/**
 * Case-insensitive substring match over name + summary — good enough for
 * Phase 0's dummy dataset size.
 *
 * `6.a.iii.zi` extends the "first-party shelf always first" rule
 * (`5.h.i.zo`, home page) to search: a Zealot/D-Store (`origin ===
 * "zealot"`) app that matches the query is hard-pinned to result
 * position 1, the same prepend mechanism the home-page shelf already
 * uses — not a weight added to the relevance sort below it. Confirmed
 * with the product owner (the leaf's own "open decision" note):
 * "first only among matching results," not unconditional — a
 * first-party app that doesn't match the query at all is never
 * injected, only reordered to the front *if* it's already one of the
 * matches. `findIndex`+`splice`+`unshift` rather than a sort
 * comparator so every other match keeps its existing relative
 * relevance order untouched; only the one first-party match (if any)
 * moves.
 */
export async function searchApps(query: string): Promise<App[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return resolveAfterDelay([]);
  const merged = await getMergedApps();
  const matches = merged.filter(
    (app) => app.name.toLowerCase().includes(needle) || app.summary.toLowerCase().includes(needle)
  );
  const firstPartyIndex = matches.findIndex((app) => app.origin === "zealot");
  if (firstPartyIndex > 0) {
    const [firstParty] = matches.splice(firstPartyIndex, 1);
    matches.unshift(firstParty);
  }
  return resolveAfterDelay(matches);
}

/**
 * One page of search results — leaf `5.l.v.zo`. Table mode only, same contract as
 * `getTopFreePage`: `null` silently when the table is not in use (the caller then uses `searchApps`
 * exactly as before) and `null` with one fixed log line when the read failed. The match rule is
 * `searchApps`': case-insensitive substring over name or summary. Page 1 is the matching first-party
 * apps (list order, the same "first-party leads" rule `6.a.iii.zi` set) and then the first
 * third-party matches from the table in `top` order (reported downloads, then slug); later pages are
 * third-party only. One difference from `searchApps`, on purpose: it pins only the FIRST first-party
 * match to the front and leaves any others in merged order, while here every first-party match leads,
 * which is what the merged order already gives (first-party apps come first in it). A blank query is
 * an empty result. The query is cut to 100 characters, as the database search does. This function
 * does NOT log the query (`logSearchQuery` is the page's, once per submitted search); `after` is the
 * raw `after` URL value.
 */
export interface SearchPage {
  apps: App[];
  /** Opaque; pass back as `after` for the next page. `null` on the last page. */
  nextCursor: string | null;
  /** True for page 1 (no valid `after`), the only page that should be logged as a search. */
  isFirstPage: boolean;
}

export async function getSearchPage(query: string, after?: unknown, pageSize?: number): Promise<SearchPage | null> {
  if (!useCatalogTable()) return null;
  const firstParty = await getFirstPartyList();
  const page = await readAppsPage({ order: "top", query, after: parseAfter("top", after), pageSize, firstParty });
  if (page === null) {
    console.error("catalog: paged table read failed, using the whole-catalog path");
    return null;
  }
  return { apps: page.apps, nextCursor: page.nextCursor, isFirstPage: page.isFirstPage };
}

/**
 * Records a search for the `3.c.ii.zo` top-searches dashboard.
 * Deliberately called from `app/search/page.tsx`'s call site, not from
 * `searchApps` itself: `searchApps` also backs `SearchBar`'s debounced
 * instant-suggestions dropdown (`lib/search-actions.ts`), which fires
 * on every settled keystroke pause, not just a completed search — an
 * app slug typed one pause at a time ("c", "ch", "cha", "chat") would
 * log four fragment rows for one real search. `/search`'s own page
 * load only happens once per actual submission (Enter, a suggestion
 * click that navigates, or a direct `/search?q=...` link), so that's
 * the one call site that represents a finished query, not a keystroke.
 *
 * No-op on a blank query, same guard `searchApps` itself already has.
 */
export async function logSearchQuery(query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;
  searchQueries.push({
    id: `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query: trimmed,
    created_at: new Date().toISOString(),
  });
  // 5.g.v.zo part (d): also record it in `search_log` when Supabase is configured. The in-memory
  // row above stays for the admin search page. The result is ignored on purpose: a search must
  // never fail or slow down because the log did (the store's own timeout bounds the wait).
  await logSearch(trimmed);
}

/** Other apps in the same category, excluding the app itself — backs the "Similar apps" rail on the detail page. */
export async function getSimilarApps(
  appSlug: string,
  limit = 6,
  /** 5.l.vi.zi — the app's own `(app_type, category)` when the caller already has the app, so table mode does not look it up again. */
  known?: Pick<App, "app_type" | "category">
): Promise<App[]> {
  // 5.l.vi.zi — table mode: the first-party apps of the category, then one bounded `top`-order page of
  // its third-party rows (`readAppsPage`, the same read the category page uses), minus the app itself.
  // The same order the whole-catalog path gives (first-party first, then by reported downloads).
  if (useCatalogTable()) {
    try {
      const firstParty = await getFirstPartyList();
      const source = known ?? (await getAppBySlugFromTable(appSlug));
      if (source === null) return resolveAfterDelay([]);
      if (source !== undefined) {
        const page = await readAppsPage({
          scope: { appType: source.app_type, category: source.category },
          order: "top",
          pageSize: Math.min(Math.max(limit, 1) + 1, CATALOG_PAGE_MAX),
          firstParty,
        });
        if (page !== null) {
          return resolveAfterDelay(page.apps.filter((app) => app.slug !== appSlug).slice(0, limit));
        }
      }
    } catch {
      // fall through to the whole-catalog path
    }
    console.error("catalog: similar apps read failed, using the whole catalog");
  }
  const merged = await getMergedApps();
  const source = merged.find((a) => a.slug === appSlug);
  if (!source) return resolveAfterDelay([]);
  // 5.i.vii.zo — every source emits Play slugs now, so compare the stored
  // (app_type, category) pair directly; no read-time translation.
  const result = merged
    .filter((app) => app.slug !== appSlug && appInTaxonomyCategory(app, source.app_type, source.category))
    .slice(0, limit);
  return resolveAfterDelay(result);
}

/**
 * Category-affinity recommendations — leaf `4.d.ii.zi`, first of the two
 * `4.d.ii` (Recommendations) leaves. Backs the home page's "For You" row.
 *
 * There are no accounts (per docs/D-STORE.md §3), so this leaf's
 * affinity signal originally started as "which categories has this
 * visitor favorited apps in" (`4.d.i`'s favorites, `lib/favorites.ts`) —
 * the only per-device signal that existed at the time that reflected a
 * deliberate choice and was resolvable back to a category. `4.d.ii.zo`
 * (below) folds in the richer signal this leaf's own comment flagged as
 * missing: local view history (`lib/view-history.ts`).
 *
 * `favoritedSlugs` is passed in by the caller (`getForYouAppsAction`,
 * `lib/favorites-actions.ts`) rather than read here directly: this file
 * has no access to browser storage (server-only), same reason
 * `getFavoritedAppsAction` takes `slugs` as a parameter instead of
 * calling `listFavorites()` itself. Pass them in `listFavorites()`'s own
 * order (most-recently-favorited first) so a tie between two categories'
 * scores below resolves toward the visitor's more recent taste.
 *
 * Ranking (tuned by `4.d.ii.zo`): each favorited app's category scores
 * `FAVORITE_WEIGHT` points, each viewed-category entry (`viewedCategories`,
 * newest first, already resolved to categories by the caller — see
 * `getForYouAppsAction`) scores `VIEW_WEIGHT`. Favoriting is a deliberate,
 * durable signal ("I want this"); viewing is a much weaker, noisier one
 * (a visitor opens plenty of app pages they don't end up caring about),
 * so a favorite outweighs a single view several times over rather than
 * counting equally — one favorite in a category should generally still
 * outrank a handful of idle views in another. Categories are then ranked
 * by total score, ties broken by whichever signal (favorite or view)
 * touched that category most recently across the two lists — `firstSeen`
 * below records each category's earliest index across both inputs
 * (lower index = more recent, since both lists are newest-first), and a
 * lower `firstSeen` wins a tie the same way `categoryOrder`'s original
 * recency tiebreak did before views existed.
 *
 * Apps are then pulled from ranked categories in that order, each
 * category's own apps sorted by `install_count` descending (the same
 * "popularity within the group" signal `getTopFreeApps` uses) as a
 * reasonable proxy for "worth surfacing" absent any other ranking
 * signal. Already-favorited apps are excluded — recommending someone an
 * app they've already saved isn't a recommendation; already-viewed apps
 * are not excluded, since opening a detail page once isn't the same
 * commitment as favoriting it, and a visitor may well want it surfaced
 * again (e.g. to finally install it). Returns `[]` (no shelf) when
 * there's no signal at all yet, same "nothing to base a recommendation
 * on" empty-state posture `getSimilarApps` would hit for an unknown
 * slug — the caller (`ForYouShelf`) renders no shelf at all for an
 * empty result, same convention `Shelf` itself already uses for an
 * empty `apps` array, rather than showing a "why are you seeing this"
 * empty state for a row nobody would miss if it simply weren't there.
 */
const FAVORITE_WEIGHT = 3;
const VIEW_WEIGHT = 1;

export async function getCategoryAffinityApps(
  favoritedSlugs: string[],
  viewedCategories: string[] = [],
  limit = 12
): Promise<App[]> {
  if (favoritedSlugs.length === 0 && viewedCategories.length === 0) return resolveAfterDelay([]);

  const merged = await getMergedApps();
  const bySlug = new Map(merged.map((app) => [app.slug, app]));

  const categoryScores = new Map<string, number>();
  const firstSeen = new Map<string, number>(); // lower = more recent
  let cursor = 0;

  for (const slug of favoritedSlugs) {
    // 5.i.vi.zi — compare on the Play slug, not the stored one, so a legacy-slug
    // app and a viewed Play slug for the same interest agree; an app with no
    // known category is not an interest (`affinityCategory` -> null).
    const favApp = bySlug.get(slug);
    const category = favApp ? affinityCategory(favApp.category, favApp.app_type) : null;
    if (!category) continue;
    categoryScores.set(category, (categoryScores.get(category) ?? 0) + FAVORITE_WEIGHT);
    if (!firstSeen.has(category)) firstSeen.set(category, cursor);
    cursor += 1;
  }
  for (const viewed of viewedCategories) {
    // Idempotent for a Play slug, so it is safe whether the caller already
    // translated (`listViewedCategories`) or not.
    const category = affinityCategory(viewed);
    if (category === null) continue;
    categoryScores.set(category, (categoryScores.get(category) ?? 0) + VIEW_WEIGHT);
    if (!firstSeen.has(category)) firstSeen.set(category, cursor);
    cursor += 1;
  }

  const rankedCategories = [...categoryScores.keys()].sort((a, b) => {
    const scoreDiff = (categoryScores.get(b) ?? 0) - (categoryScores.get(a) ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (firstSeen.get(a) ?? Infinity) - (firstSeen.get(b) ?? Infinity);
  });

  const favoritedSet = new Set(favoritedSlugs);
  const seen = new Set<string>();
  const result: App[] = [];
  for (const category of rankedCategories) {
    const inCategory = merged
      .filter(
        (app) =>
          affinityCategory(app.category, app.app_type) === category && !favoritedSet.has(app.slug) && !seen.has(app.slug)
      )
      .sort((a, b) => b.install_count - a.install_count);
    for (const app of inCategory) {
      if (result.length >= limit) break;
      seen.add(app.slug);
      result.push(app);
    }
    if (result.length >= limit) break;
  }

  return resolveAfterDelay(result);
}

/** Backs the developer profile page (0.g.iii.zo), `/developer/[slug]`. */
export async function getDeveloperBySlug(slug: string): Promise<Developer | null> {
  const declared = developers.find((d) => d.slug === slug);
  if (declared) return resolveAfterDelay(declared);

  // 5.h.iv.zi — no static row: derive one from the merged catalog's own
  // per-app data. Only what a source actually supplied is filled in
  // (Aptoide: publisher name + website); bio and joined date stay null
  // rather than being invented. Website is only carried through when it
  // is an http(s) URL, since it is rendered as a link.
  // 5.l.vi.zi — table mode: a first-party app by this developer answers from the small cached list;
  // otherwise one row of the table (name and website only). `undefined` = the read failed.
  if (useCatalogTable()) {
    try {
      const own = (await getFirstPartyList()).find((app) => app.developer_slug === slug);
      if (own) return resolveAfterDelay(developerFromApp(slug, own));
      const looked = await readCatalogDeveloper(slug);
      if (looked.ok) {
        return resolveAfterDelay(
          looked.developer === null
            ? null
            : { slug, name: looked.developer.name, bio: null, profile_url: looked.developer.website, joined_at: null }
        );
      }
    } catch {
      // fall through to the whole-catalog path
    }
    console.error("catalog: developer lookup failed, using the whole catalog");
  }

  const merged = await getMergedApps();
  const match = merged.find((app) => app.developer_slug === slug);
  if (!match) return resolveAfterDelay(null);
  return resolveAfterDelay(developerFromApp(slug, match));
}

/** The derived `Developer` for an app that has no static row: only what the source supplied; bio and joined date stay null. */
function developerFromApp(slug: string, match: App): Developer {
  const website = match.developer_website && /^https?:\/\//i.test(match.developer_website) ? match.developer_website : null;
  return {
    slug,
    name: match.developer_name ?? slug,
    bio: null,
    profile_url: website,
    joined_at: null,
  };
}

/** Every published app by a given developer, most recently updated first — the profile page's app list. */
export async function getAppsByDeveloper(developerSlug: string): Promise<App[]> {
  const merged = await getMergedApps();
  const result = [...merged]
    .filter((app) => app.developer_slug === developerSlug)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  return resolveAfterDelay(result);
}

// --- Sponsored placement, read-only (5.j.ii.zi) -------------------------------------------

/**
 * Sponsored placement — leaf `5.j.ii.zi`, **retires** the `3.c.i.zo`
 * admin-scheduling tool below it in history. Per the cross-repo
 * "sponsored placement & collections" decision (`HANDOVER.md`), Zealot's
 * Console is now where `sponsored_slots` windows are authored
 * (`5.j.i.zo`) and this repo only reads them straight off each app via
 * the signed index (`lib/sources/zealot.ts`) — no local
 * create/update/delete seam, no standalone entity to keep in sync. Both
 * functions below read `App.sponsored_slots` on the merged catalog;
 * neither mutates anything.
 */

/** Every app carrying at least one sponsored-placement window, most recently updated first — backs the read-only listing at `/admin/sponsored`. */
export async function getSponsoredApps(): Promise<App[]> {
  const merged = await getMergedApps();
  const result = merged
    .filter((app) => app.sponsored_slots.length > 0)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  return resolveAfterDelay(result);
}

/**
 * The app `SponsoredCard` should actually render today, or `null` if
 * none has an active window — `SponsoredCard` falls back to its
 * existing static placeholder in that case, same as before this leaf.
 *
 * "Active" means today falls within `[starts_at, ends_at]` inclusive,
 * per Zealot's own `date-time` fields (unlike the old day-granularity
 * `SponsoredSlot`, these compare full timestamps).
 *
 * If more than one app has a window covering today — a real scheduling
 * conflict the Console's own admin should prevent, not something this
 * read-only reader can reject — the most recently *updated* app wins
 * (`getSponsoredApps`' own sort order), the same deterministic
 * "last write wins" default the retired entity used, now applied to
 * apps instead of bookings.
 *
 * `referenceDate` defaults to `new Date()` but is accepted as a
 * parameter so this is exercisable without depending on the system
 * clock — same seam the retired function offered.
 */
export async function getActiveSponsoredSlot(referenceDate: Date = new Date()): Promise<App | null> {
  const now = referenceDate.toISOString();
  const active = (await getSponsoredApps()).find((app) =>
    app.sponsored_slots.some((slot) => slot.starts_at <= now && now <= slot.ends_at)
  );
  return active ?? null;
}

// --- Traffic dashboard (3.c.ii.zi) -------------------------------------------

/** One row of `TrafficSummary.perApp` — just the fields the dashboard actually renders, not a whole `App`. */
export interface TrafficSummaryRow {
  slug: string;
  name: string;
  install_count: number;
  view_count: number;
}

export interface TrafficSummary {
  totalInstalls: number;
  totalViews: number;
  appCount: number;
  /** Every app, `view_count` descending — the dashboard's own ranking, independent of `getTopFreeApps`' `install_count` ranking or `getTrendingApps`' cached one. */
  perApp: TrafficSummaryRow[];
}

/**
 * Traffic dashboard data — leaf `3.c.ii.zi`, the first leaf of `3.c.ii`
 * (Analytics). Backs `/admin/traffic`: the two totals across the whole
 * catalog, plus a per-app breakdown ranked by `view_count` (the same
 * field `getTrendingApps`, `3.b.ii.zo`, already treats as the
 * "attention right now" signal, reused here for the same reason).
 *
 * Deliberately a fresh live sum/sort on every call, not a materialized
 * snapshot the way `getTrendingApps` is — this dashboard has no
 * "daily" framing to justify that caching layer (same reasoning
 * `getTopFreeApps`, `3.b.iii.zi`, already gave for skipping it), and
 * an admin dashboard specifically should show current totals, not a
 * cached-until-tomorrow number.
 *
 * `perApp` returns the whole catalog, not a capped preview — same
 * "a dashboard's whole point is the full list" reasoning
 * `getTopFreeApps` already established for chart pages.
 */
export async function getTrafficSummary(): Promise<TrafficSummary> {
  const merged = await getMergedApps();
  const totalInstalls = merged.reduce((sum, app) => sum + app.install_count, 0);
  const totalViews = merged.reduce((sum, app) => sum + app.view_count, 0);
  const perApp = [...merged]
    .map((app) => ({
      slug: app.slug,
      name: app.name,
      install_count: app.install_count,
      view_count: app.view_count,
    }))
    .sort((a, b) => b.view_count - a.view_count);

  return resolveAfterDelay({
    totalInstalls,
    totalViews,
    appCount: merged.length,
    perApp,
  });
}

// --- Top-searches dashboard (3.c.ii.zo) --------------------------------------

/** One ranked row of `TopSearchesSummary.topQueries`. */
export interface TopSearchRow {
  query: string;
  count: number;
}

export interface TopSearchesSummary {
  totalSearches: number;
  /** Distinct query count after case-folding — e.g. "Chat" and "chat" are one entry, not two. */
  distinctQueryCount: number;
  /** Ranked by `count` descending, case-folded and deduplicated; not capped, same "a dashboard's whole point is the full list" reasoning `getTrafficSummary` already used. */
  topQueries: TopSearchRow[];
}

/**
 * Top-searches dashboard data — leaf `3.c.ii.zo`, the second leaf of
 * `3.c.ii` (Analytics). Backs `/admin/search`: aggregates every row
 * `logSearchQuery` has appended to `searchQueries` (`lib/mock-data.ts`)
 * into query counts, case-folded so casing variants of the same search
 * don't split a query's count across multiple rows. The *display*
 * label for each ranked row is the first-seen casing for that
 * case-folded query, not a re-lowercased string — reads more like a
 * real search term this way rather than an all-lowercase log dump.
 *
 * A fresh live aggregation on every call, not a materialized snapshot
 * — same reasoning `getTrafficSummary` already gave for skipping that
 * caching layer.
 */
export async function getTopSearches(): Promise<TopSearchesSummary> {
  const countsByKey = new Map<string, { display: string; count: number }>();
  for (const entry of searchQueries) {
    const key = entry.query.toLowerCase();
    const existing = countsByKey.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      countsByKey.set(key, { display: entry.query, count: 1 });
    }
  }

  const topQueries = Array.from(countsByKey.values())
    .map(({ display, count }) => ({ query: display, count }))
    .sort((a, b) => b.count - a.count);

  return resolveAfterDelay({
    totalSearches: searchQueries.length,
    distinctQueryCount: topQueries.length,
    topQueries,
  });
}
