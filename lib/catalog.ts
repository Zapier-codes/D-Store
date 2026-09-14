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

import { apps, categories, appCountByCategory, type App, type Category } from "./mock-data";

export type { App, Category };

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
}

export async function getApps(options: GetAppsOptions = {}): Promise<App[]> {
  let result = apps;
  if (options.category) {
    result = result.filter((app) => app.category === options.category);
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
