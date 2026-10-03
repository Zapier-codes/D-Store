/**
 * Bounded third-party reads for the home shelves and the chart lists — leaf `5.l.iv.zi`.
 *
 * SERVER-ONLY (it calls `lib/catalog-table.ts`). Used by `lib/catalog.ts` only when the
 * Supabase env is set (`useCatalogTable`, leaf `5.l.xvii.zi`).
 *
 * What it does: returns the first `want` Aptoide-origin apps of one order (`top` or `new`)
 * straight from `catalog_page`, so a home shelf no longer needs the whole catalog in memory.
 * First-party (Zealot) apps are not rows and are not read here; the caller already has them.
 *
 * Rules, matching `mergeCatalogSources` (`lib/sources/types.ts`):
 * - A row whose `package_name` matches a first-party app's is dropped (first-party wins).
 * - Order is the database's own (`top`: reported downloads then slug; `new`: source update time),
 *   so the result is the same prefix the whole-catalog path would have produced for that order.
 *
 * Contract: never throws. `null` means "could not answer" (not configured, bad argument or a
 * failed or refused page); the caller then falls back to the whole-catalog path. A partial answer
 * is never returned. Nothing is logged here.
 */

import { CATALOG_PAGE_MAX, readCatalogPage, type CatalogOrder, type CatalogTableDeps } from "./catalog-table";
import type { App } from "./mock-data";
import { appFromCatalogRow } from "./sources/catalog-table";

/** Largest shelf this path serves. A bigger ask (a full chart) belongs to the paged pages of leaf 9. */
export const SHELF_MAX = 200;
/** Pages read before giving up; only reached when many rows collide with first-party packages. */
export const SHELF_MAX_PAGES = 4;

export async function readThirdPartyShelf(
  order: CatalogOrder,
  want: number,
  firstParty: readonly App[],
  deps: CatalogTableDeps = {}
): Promise<App[] | null> {
  if (!Number.isInteger(want) || want < 0 || want > SHELF_MAX) return null;
  if (want === 0) return [];

  const taken = new Set<string>();
  for (const app of firstParty) if (app.package_name) taken.add(app.package_name);

  // Ask for enough to cover the first-party apps that could collide, in one page where possible.
  const limit = Math.min(CATALOG_PAGE_MAX, want + firstParty.length);
  const out: App[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < SHELF_MAX_PAGES; page += 1) {
    const result = await readCatalogPage({ order, limit, cursor }, deps);
    if (!result.ok) return null;
    for (const row of result.rows) {
      if (taken.has(row.package_name)) continue;
      taken.add(row.package_name);
      out.push(appFromCatalogRow(row));
      if (out.length >= want) return out;
    }
    if (!result.nextCursor) return out;
    cursor = result.nextCursor;
  }
  // Ran out of pages before filling the shelf: a short answer would look complete, so refuse it.
  return null;
}
