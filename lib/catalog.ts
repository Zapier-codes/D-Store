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

import { apps, categories, developers, reviews, sponsoredSlots, appCountByCategory, type App, type Category, type Developer, type Review, type SponsoredSlot } from "./mock-data";

export type { App, Category, Developer, SponsoredSlot };

const SIMULATED_LATENCY_MS = 200;

function resolveAfterDelay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

// --- Categories -------------------------------------------------------

export async function getCategories(): Promise<Category[]> {
  return resolveAfterDelay(categories);
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const category = categories.find((c) => c.slug === slug) ?? null;
  return resolveAfterDelay(category);
}

/** App count per category — same value `Category.count` held in the legacy entity, derived here instead of stored. */
export async function getCategoryAppCount(slug: string): Promise<number> {
  return resolveAfterDelay(appCountByCategory(slug));
}

// --- Apps: listing & lookup -------------------------------------------

export interface GetAppsOptions {
  category?: string;
  limit?: number;
  license?: string;
  maxSizeMb?: number;
  /** ISO 3166-1 alpha-2 code, e.g. from `lib/region.ts`'s `getRegion().country_code`. See `filterAppsByRegion` below. */
  region?: string;
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
  let result = apps;
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
  if (options.limit) {
    result = result.slice(0, options.limit);
  }
  return resolveAfterDelay(result);
}

export async function getAppBySlug(slug: string): Promise<App | null> {
  const app = apps.find((a) => a.slug === slug) ?? null;
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
  const result = apps.filter((app) => app.is_featured).slice(0, limit);
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

function materializeTrendingCache(): TrendingCacheEntry {
  const rankedSlugs = [...apps]
    .sort((a, b) => b.view_count - a.view_count)
    .map((app) => app.slug);
  return { computedAt: Date.now(), rankedSlugs };
}

function getOrRefreshTrendingCache(): TrendingCacheEntry {
  const isStale = !trendingCache || Date.now() - trendingCache.computedAt > TRENDING_CACHE_TTL_MS;
  if (isStale) {
    trendingCache = materializeTrendingCache();
  }
  // Non-null by construction: either the cache existed and wasn't
  // stale, or it was just (re)assigned above. TS can't carry that
  // narrowing across a module-level `let` on its own.
  return trendingCache!;
}

export async function getTrendingApps(limit = 12): Promise<App[]> {
  const cache = getOrRefreshTrendingCache();

  const result = cache.rankedSlugs
    .map((slug) => apps.find((app) => app.slug === slug))
    .filter((app): app is App => app !== undefined)
    .slice(0, limit);
  return resolveAfterDelay(result);
}

export async function getEditorsPicks(limit = 12): Promise<App[]> {
  const result = apps.filter((app) => app.is_editors_pick).slice(0, limit);
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
  const result = [...apps].sort((a, b) => b.install_count - a.install_count);
  return resolveAfterDelay(result);
}

/** "New & Updated" shelf (docs/D-STORE.md §4A) — sorted by `updated_at` descending. */
export async function getNewAndUpdated(limit = 12): Promise<App[]> {
  const result = [...apps]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, limit);
  return resolveAfterDelay(result);
}

// --- Search & related content (0.g) -------------------------------------------

/** Case-insensitive substring match over name + summary — good enough for Phase 0's dummy dataset size. */
export async function searchApps(query: string): Promise<App[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return resolveAfterDelay([]);
  const result = apps.filter(
    (app) => app.name.toLowerCase().includes(needle) || app.summary.toLowerCase().includes(needle)
  );
  return resolveAfterDelay(result);
}

/** Other apps in the same category, excluding the app itself — backs the "Similar apps" rail on the detail page. */
export async function getSimilarApps(appSlug: string, limit = 6): Promise<App[]> {
  const source = apps.find((a) => a.slug === appSlug);
  if (!source) return resolveAfterDelay([]);
  const result = apps.filter((app) => app.category === source.category && app.slug !== appSlug).slice(0, limit);
  return resolveAfterDelay(result);
}

/** Backs the developer profile page (0.g.iii.zo), `/developer/[slug]`. */
export async function getDeveloperBySlug(slug: string): Promise<Developer | null> {
  const developer = developers.find((d) => d.slug === slug) ?? null;
  return resolveAfterDelay(developer);
}

/** Every published app by a given developer, most recently updated first — the profile page's app list. */
export async function getAppsByDeveloper(developerSlug: string): Promise<App[]> {
  const result = [...apps]
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
