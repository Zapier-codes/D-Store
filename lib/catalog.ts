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

import { apps, categories, developers, appCountByCategory, type App, type Category, type Developer } from "./mock-data";

export type { App, Category, Developer };

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

// --- Home page shelves (0.d) -------------------------------------------

export async function getFeaturedApps(limit = 6): Promise<App[]> {
  const result = apps.filter((app) => app.is_featured).slice(0, limit);
  return resolveAfterDelay(result);
}

export async function getTrendingApps(limit = 12): Promise<App[]> {
  const result = [...apps].sort((a, b) => b.install_count - a.install_count).slice(0, limit);
  return resolveAfterDelay(result);
}

export async function getEditorsPicks(limit = 12): Promise<App[]> {
  const result = apps.filter((app) => app.is_editors_pick).slice(0, limit);
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
