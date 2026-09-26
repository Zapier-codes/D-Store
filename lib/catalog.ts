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

import { apps, categories, collections, developers, reviews, sponsoredSlots, searchQueries, type App, type AppOrigin, type Category, type Collection, type Developer, type Review, type SponsoredSlot, type SearchQueryLog } from "./mock-data";
import { mergeCatalogSources, type CatalogSource } from "./sources/types";
import { createAptoideSource } from "./sources/aptoide";
import { createZealotSource as createLiveZealotSource } from "./sources/zealot";

export type { App, AppOrigin, Category, Collection, Developer, SponsoredSlot, SearchQueryLog };

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
function createZealotSource(): CatalogSource {
  return createLiveZealotSource();
}

/**
 * Merged catalog — Zealot first (so it wins any `package_name`
 * collision per `mergeCatalogSources`), then Aptoide's ingested
 * snapshot. Computed once per server lifetime and cached: the Aptoide
 * side already reads from a cached snapshot file
 * (`lib/sources/aptoide.ts`), and `apps` itself is a stable in-memory
 * array, so nothing here needs to be recomputed on every call — mirrors
 * `loadSnapshot`'s own caching in that file.
 */
let cachedMergedApps: App[] | null = null;

async function getMergedApps(): Promise<App[]> {
  if (cachedMergedApps) return cachedMergedApps;
  cachedMergedApps = await mergeCatalogSources([createZealotSource(), createAptoideSource()]);
  return cachedMergedApps;
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



export async function getCategories(): Promise<Category[]> {
  return resolveAfterDelay(categories);
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const category = categories.find((c) => c.slug === slug) ?? null;
  return resolveAfterDelay(category);
}

/** App count per category — same value `Category.count` held in the legacy entity, derived here instead of stored. */
export async function getCategoryAppCount(slug: string): Promise<number> {
  const merged = await getMergedApps();
  return resolveAfterDelay(merged.filter((app) => app.category === slug).length);
}

// --- Collections: editorial groupings (leaf 4.c.ii.zo) -----------------

export async function getCollections(): Promise<Collection[]> {
  return resolveAfterDelay(collections);
}

export async function getCollectionBySlug(slug: string): Promise<Collection | null> {
  const collection = collections.find((c) => c.slug === slug) ?? null;
  return resolveAfterDelay(collection);
}

/**
 * Member apps of one collection, in the collection's own curated order
 * (`Collection.app_package_names`'s order — `sort`, not `filter`'s
 * incidental catalog order, so re-ordering the seed data is enough to
 * re-order the shelf/page without touching this function). Apps whose
 * package name isn't in the merged catalog (a listing pulled from
 * Aptoide, a future catalog refresh) are silently skipped rather than
 * thrown on, the same defensive posture `mergeCatalogSources` already
 * takes for a missing `package_name`.
 */
export async function getCollectionApps(slug: string): Promise<App[]> {
  const collection = collections.find((c) => c.slug === slug);
  if (!collection) return resolveAfterDelay([]);
  const merged = await getMergedApps();
  const byPackage = new Map(merged.filter((app) => app.package_name).map((app) => [app.package_name, app]));
  const ordered = collection.app_package_names
    .map((pkg) => byPackage.get(pkg))
    .filter((app): app is App => app !== undefined);
  return resolveAfterDelay(ordered);
}

/** Member-app count per collection, same "pass counts down, don't fetch per-card" pattern `getCategoryAppCount` established. */
export async function getCollectionAppCount(slug: string): Promise<number> {
  const apps = await getCollectionApps(slug);
  return apps.length;
}

// --- Apps: listing & lookup -------------------------------------------

export interface GetAppsOptions {
  category?: string;
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
  if (options.category) {
    result = result.filter((app) => app.category === options.category);
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

export async function getAppBySlug(slug: string): Promise<App | null> {
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
// NOTE (leaf 5.h.ii.zi, flagged not fixed): the three mutators below
// (`incrementInstallCount`, `incrementViewCount`, and the rating
// submission further down) still look up against the Zealot-origin
// `apps` array only, not `getMergedApps()`'s combined result — so
// clicking Install/viewing/rating an Aptoide-sourced app's detail page
// returns "not found" (404 at the route-handler level) instead of
// actually incrementing anything. Left as-is rather than silently
// papered over: whether a third-party app should even have its own
// store-native counters, versus deferring entirely to Aptoide's own
// numbers, is a product call this leaf doesn't make. Surfaced for the
// next session/leaf to decide.
export async function incrementInstallCount(slug: string): Promise<number | null> {
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
 * Admin featuring toggle — leaf `3.c.i.zi` (Admin/Editorial Tools,
 * Featuring). Flips `is_featured` and/or `is_editors_pick` on a single
 * app; either flag is optional so a caller can update just one without
 * clobbering the other. Same seam as every other mutator in this file:
 * writes through the in-memory dummy `apps` array today, swaps for a
 * real Supabase `UPDATE` once `5.f.i` lands, and its caller
 * (`app/api/admin/apps/[slug]/featuring/route.ts`) doesn't change when
 * that happens.
 *
 * `getFeaturedApps`/`getEditorsPicks` above already read these two
 * fields straight off the `App` row with no separate cache to
 * invalidate, so a toggle here is immediately reflected the next time
 * either shelf is fetched — no extra bookkeeping needed the way
 * `getTrendingApps`'s materialized cache would require.
 *
 * Returns the updated `App`, or `null` for an unknown slug — same
 * "not found" shape every other slug-keyed lookup/mutator in this file
 * uses.
 */
export async function setAppFeaturing(
  slug: string,
  updates: { is_featured?: boolean; is_editors_pick?: boolean }
): Promise<App | null> {
  const app = apps.find((a) => a.slug === slug);
  if (!app) {
    return resolveAfterDelay(null);
  }
  if (updates.is_featured !== undefined) {
    app.is_featured = updates.is_featured;
  }
  if (updates.is_editors_pick !== undefined) {
    app.is_editors_pick = updates.is_editors_pick;
  }
  return resolveAfterDelay(app);
}

// --- Home page shelves (0.d) -------------------------------------------

export async function getFeaturedApps(limit = 6): Promise<App[]> {
  const merged = await getMergedApps();
  const result = merged.filter((app) => app.is_featured).slice(0, limit);
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
  const merged = await getMergedApps();
  const result = merged.filter((app) => app.origin === "zealot").slice(0, limit);
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
  const merged = await getMergedApps();
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
  const merged = await getMergedApps();

  const result = cache.rankedSlugs
    .map((slug) => merged.find((app) => app.slug === slug))
    .filter((app): app is App => app !== undefined)
    .slice(0, limit);
  return resolveAfterDelay(result);
}

export async function getEditorsPicks(limit = 12): Promise<App[]> {
  const merged = await getMergedApps();
  const result = merged.filter((app) => app.is_editors_pick).slice(0, limit);
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
 */
export async function getTopFreeApps(): Promise<App[]> {
  const merged = await getMergedApps();
  const result = [...merged].sort((a, b) => b.install_count - a.install_count);
  return resolveAfterDelay(result);
}

/** "New & Updated" shelf (docs/D-STORE.md §4A) — sorted by `updated_at` descending. */
export async function getNewAndUpdated(limit = 12): Promise<App[]> {
  const merged = await getMergedApps();
  const result = [...merged]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, limit);
  return resolveAfterDelay(result);
}

// --- Search & related content (0.g) -------------------------------------------

/** Case-insensitive substring match over name + summary — good enough for Phase 0's dummy dataset size. */
export async function searchApps(query: string): Promise<App[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return resolveAfterDelay([]);
  const merged = await getMergedApps();
  const result = merged.filter(
    (app) => app.name.toLowerCase().includes(needle) || app.summary.toLowerCase().includes(needle)
  );
  return resolveAfterDelay(result);
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
}

/** Other apps in the same category, excluding the app itself — backs the "Similar apps" rail on the detail page. */
export async function getSimilarApps(appSlug: string, limit = 6): Promise<App[]> {
  const merged = await getMergedApps();
  const source = merged.find((a) => a.slug === appSlug);
  if (!source) return resolveAfterDelay([]);
  const result = merged.filter((app) => app.category === source.category && app.slug !== appSlug).slice(0, limit);
  return resolveAfterDelay(result);
}

/**
 * Category-affinity recommendations — leaf `4.d.ii.zi`, first of the two
 * `4.d.ii` (Recommendations) leaves. Backs the home page's "For You" row.
 *
 * There are no accounts (per docs/D-STORE.md §3) and no view-history
 * store yet — `4.d.i`'s favorites (`lib/favorites.ts`, IndexedDB) is the
 * only per-device signal that exists today that both (a) reflects a
 * deliberate choice, not incidental browsing, and (b) is resolvable back
 * to a category. So this leaf's affinity signal is "which categories has
 * this visitor favorited apps in," not a full browsing-history model —
 * `4.d.ii.zo` ("personalization tuning from local history") is where a
 * richer signal (e.g. view history) gets folded in, once one exists.
 *
 * `favoritedSlugs` is passed in by the caller (`getForYouAppsAction`,
 * `lib/favorites-actions.ts`) rather than read here directly: this file
 * has no access to IndexedDB (server-only), same reason
 * `getFavoritedAppsAction` takes `slugs` as a parameter instead of
 * calling `listFavorites()` itself. Pass them in `listFavorites()`'s own
 * order (most-recently-favorited first) so a tie between two categories'
 * favorite counts below resolves toward the visitor's more recent taste.
 *
 * Ranking: categories are ordered by how many of the visitor's favorites
 * fall into them (ties broken by recency, per the paragraph above); apps
 * are then pulled from those categories in that category order, each
 * category's own apps sorted by `install_count` descending (the same
 * "popularity within the group" signal `getTopFreeApps` uses) as a
 * reasonable proxy for "worth surfacing" absent any other ranking
 * signal. Already-favorited apps are excluded — recommending someone an
 * app they've already saved isn't a recommendation. Returns `[]` (no
 * shelf) when there are no favorites yet, same "nothing to base a
 * recommendation on" empty-state posture `getSimilarApps` would hit for
 * an unknown slug — the caller (`ForYouShelf`) renders no shelf at all
 * for an empty result, same convention `Shelf` itself already uses for
 * an empty `apps` array, rather than showing a "why are you seeing
 * this" empty state for a row nobody would miss if it simply weren't
 * there.
 */
export async function getCategoryAffinityApps(favoritedSlugs: string[], limit = 12): Promise<App[]> {
  if (favoritedSlugs.length === 0) return resolveAfterDelay([]);

  const merged = await getMergedApps();
  const bySlug = new Map(merged.map((app) => [app.slug, app]));

  const categoryOrder: string[] = [];
  const categoryCounts = new Map<string, number>();
  for (const slug of favoritedSlugs) {
    const category = bySlug.get(slug)?.category;
    if (!category) continue;
    if (!categoryCounts.has(category)) categoryOrder.push(category);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }
  // Most-favorited category first; `categoryOrder`'s own order (recency
  // of first favorite in it) breaks ties, since `sort` is stable.
  const rankedCategories = [...categoryOrder].sort(
    (a, b) => (categoryCounts.get(b) ?? 0) - (categoryCounts.get(a) ?? 0)
  );

  const favoritedSet = new Set(favoritedSlugs);
  const seen = new Set<string>();
  const result: App[] = [];
  for (const category of rankedCategories) {
    const inCategory = merged
      .filter((app) => app.category === category && !favoritedSet.has(app.slug) && !seen.has(app.slug))
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
  const merged = await getMergedApps();
  const match = merged.find((app) => app.developer_slug === slug);
  if (!match) return resolveAfterDelay(null);
  const website = match.developer_website && /^https?:\/\//i.test(match.developer_website) ? match.developer_website : null;
  return resolveAfterDelay({
    slug,
    name: match.developer_name ?? slug,
    bio: null,
    profile_url: website,
    joined_at: null,
  });
}

/** Every published app by a given developer, most recently updated first — the profile page's app list. */
export async function getAppsByDeveloper(developerSlug: string): Promise<App[]> {
  const merged = await getMergedApps();
  const result = [...merged]
    .filter((app) => app.developer_slug === developerSlug)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  return resolveAfterDelay(result);
}

// --- Sponsored-slot scheduling (3.c.i.zo) -------------------------------------------

/**
 * Sponsored-slot scheduling tool — leaf `3.c.i.zo`, the second leaf of
 * `3.c.i` (Featuring). `SponsoredCard` (`0.d.iii.zo`) has always
 * rendered one hardcoded placeholder ("Your app could be here"); this
 * is the admin-facing seam that lets a scheduled booking take over that
 * slot for its date range instead, backing `/admin/sponsored`.
 *
 * All four functions below share the same in-memory-array seam as
 * every other mutator in this file (`setAppFeaturing` immediately
 * above being the most recent), operating on `sponsoredSlots`
 * (`lib/mock-data.ts`) instead of `apps` — swaps for real Supabase
 * reads/writes once `5.f.i` lands.
 */

/** Every scheduled slot, most recently created first — backs the admin listing at `/admin/sponsored`. */
export async function getSponsoredSlots(): Promise<SponsoredSlot[]> {
  const result = [...sponsoredSlots].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return resolveAfterDelay(result);
}

/**
 * The slot `SponsoredCard` should actually render today, or `null` if
 * none is scheduled — `SponsoredCard` falls back to its existing
 * static placeholder in that case, so scheduling a slot is additive,
 * never a regression from what already shipped in `0.d.iii.zo`.
 *
 * "Active" means today's date falls within `[start_date, end_date]`
 * inclusive, compared at day granularity (both sides normalized to
 * midnight UTC) since `SponsoredSlot` only stores dates, not
 * timestamps — a slot scheduled to end "today" is still active for
 * all of today, not cut off at midnight of the day it was created.
 *
 * If more than one slot's window overlaps today — a real scheduling
 * conflict an admin UI should prevent going forward, but nothing in
 * `createSponsoredSlot` below rejects it yet — the most recently
 * *created* one wins (`getSponsoredSlots`' own sort order), rather
 * than throwing or silently picking whichever happens to be first in
 * the underlying array; deterministic, and consistent with "last
 * write wins" being the simplest reasonable default for a Phase 3
 * dummy-data tool with no real conflict-resolution UI yet.
 *
 * `referenceDate` defaults to `new Date()` but is accepted as a
 * parameter so this is exercisable without depending on the system
 * clock (a fixed date can be passed directly) — no test runner exists
 * in this sandbox to actually wire that up as an automated test, but
 * the seam is there for whoever adds one.
 */
export async function getActiveSponsoredSlot(referenceDate: Date = new Date()): Promise<SponsoredSlot | null> {
  const today = referenceDate.toISOString().slice(0, 10); // YYYY-MM-DD, matches SponsoredSlot's date format
  const active = (await getSponsoredSlots()).find(
    (slot) => slot.start_date <= today && today <= slot.end_date
  );
  return active ?? null;
}

export interface CreateSponsoredSlotInput {
  name: string;
  summary: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
}

/** Schedules a new sponsored slot. No overlap validation — see `getActiveSponsoredSlot`'s comment on how an overlap is resolved if one occurs. */
export async function createSponsoredSlot(input: CreateSponsoredSlotInput): Promise<SponsoredSlot> {
  const slot: SponsoredSlot = {
    id: `sponsored-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name,
    summary: input.summary,
    start_date: input.start_date,
    end_date: input.end_date,
    created_at: new Date().toISOString(),
  };
  sponsoredSlots.push(slot);
  return resolveAfterDelay(slot);
}

export type UpdateSponsoredSlotInput = Partial<CreateSponsoredSlotInput>;

/** Edits an existing slot's creative or schedule. Returns the updated slot, or `null` if `id` doesn't match one. */
export async function updateSponsoredSlot(
  id: string,
  updates: UpdateSponsoredSlotInput
): Promise<SponsoredSlot | null> {
  const slot = sponsoredSlots.find((s) => s.id === id);
  if (!slot) {
    return resolveAfterDelay(null);
  }
  if (updates.name !== undefined) slot.name = updates.name;
  if (updates.summary !== undefined) slot.summary = updates.summary;
  if (updates.start_date !== undefined) slot.start_date = updates.start_date;
  if (updates.end_date !== undefined) slot.end_date = updates.end_date;
  return resolveAfterDelay(slot);
}

/** Removes a scheduled slot. Returns whether a slot was actually found and removed. */
export async function deleteSponsoredSlot(id: string): Promise<boolean> {
  const index = sponsoredSlots.findIndex((s) => s.id === id);
  if (index === -1) {
    return resolveAfterDelay(false);
  }
  sponsoredSlots.splice(index, 1);
  return resolveAfterDelay(true);
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
