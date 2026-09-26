"use server";

/**
 * Favorites — server action side (leaf `4.d.i.zo`, "Saved apps" view).
 * Separated from lib/favorites.ts the same way lib/theme-actions.ts is
 * separated from lib/theme.ts / lib/search-actions.ts from lib/catalog.ts:
 * a "use server" module may only export async functions, and
 * lib/favorites.ts also exports the `FavoriteRecord` type and the
 * `useFavorite` hook that client *components* need, which can't share
 * a file with a "use server" directive.
 *
 * The favorites store itself only ever holds `slug`/`name`/`icon`/
 * `addedAt` (lib/favorites.ts) — just enough for `useFavorite`'s own
 * needs and a lightweight one-line reference, not the full `App` shape
 * a real card needs (rating, price-equivalent badges, origin label,
 * and so on). Rather than duplicating catalog fields into IndexedDB
 * and letting them go stale, the "Saved apps" page re-resolves each
 * saved slug against the live merged catalog through this action —
 * same "thin wrapper around the existing lib/catalog.ts logic, purely
 * so a client component can call it" reasoning `searchAppsAction`
 * already documents for `SearchBar`.
 */

import { getAppBySlug, type App } from "@/lib/catalog";

/**
 * Resolves saved slugs to their current `App` records, most-recently-
 * favorited first (the caller passes `slugs` in that order already —
 * `listFavorites()` sorts by `addedAt` descending). Any slug no longer
 * present in the live catalog is silently dropped, same as
 * `getCollectionApps` dropping a collection member that's since left
 * the catalog — a saved app that was pulled from the store shouldn't
 * render as a broken card.
 */
export async function getFavoritedAppsAction(slugs: string[]): Promise<App[]> {
  const apps = await Promise.all(slugs.map((slug) => getAppBySlug(slug)));
  return apps.filter((app): app is App => app !== null);
}
