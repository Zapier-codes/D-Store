/**
 * Catalog source adapter contract — leaf `5.h.ii.zi` (Catalog Sources →
 * Aptoide source). See HANDOVER.md "Resolved — catalog sources": two
 * sources feed the storefront, Zealot's signed index (first-party) and
 * Aptoide via its API (third-party), merged with the Zealot entry
 * winning any package-name collision.
 *
 * Each adapter's job is narrow on purpose: fetch its source's apps and
 * normalize them into the shared `App` shape. Nothing here decides
 * ordering (that's `5.h.i.zo`, the home page) or trust labelling
 * (that's `5.h.iii`) — this file is only "get apps, in the right shape,
 * from one source."
 */

import type { App, AppOrigin } from "../mock-data";

export interface CatalogSource {
  origin: AppOrigin;
  /**
   * Returns every app this source currently has, already normalized to
   * `App`. Adapters read from a pre-fetched snapshot (Section 3's
   * caching rule — never a live per-request call), so this is
   * synchronous-fast even though it's typed `async` to match every
   * other function in `lib/catalog.ts`.
   */
  getApps(): Promise<App[]>;
}

/**
 * Merges apps from multiple sources into one catalog, deduped by
 * `package_name` with the first source in `sources` order winning a
 * collision. Callers pass the Zealot source first so "the Zealot entry
 * wins" (HANDOVER.md's stated rule) falls out of array order rather
 * than needing its own special case.
 *
 * Apps with no `package_name` (none of the current Zealot-origin dummy
 * entries have one yet — see `lib/mock-data.ts`) are never deduped
 * against anything; they're kept as-is, keyed by `slug` instead so two
 * package-less apps don't collide with each other by accident.
 */
export async function mergeCatalogSources(sources: CatalogSource[]): Promise<App[]> {
  const merged: App[] = [];
  const seenPackages = new Set<string>();
  const seenSlugs = new Set<string>();

  for (const source of sources) {
    const apps = await source.getApps();
    for (const app of apps) {
      const key = app.package_name ?? null;
      if (key) {
        if (seenPackages.has(key)) continue; // an earlier (higher-priority) source already has this package
        seenPackages.add(key);
      } else {
        if (seenSlugs.has(app.slug)) continue;
        seenSlugs.add(app.slug);
      }
      merged.push(app);
    }
  }

  return merged;
}
