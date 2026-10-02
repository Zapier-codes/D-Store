/**
 * Category-row data for the home page — leaf `5.l.ix.zi`.
 *
 * SERVER-ONLY (it calls `lib/catalog-table.ts`). Not wired into any page yet: the home layout that
 * shows these rows is leaf `5.l.ix.zo`.
 *
 * What it does: for a list of `(app_type, category)` pairs, returns the top `perCategory`
 * Aptoide-origin apps of each, straight from `catalog_page` in `top` order (reported downloads, then
 * slug). One bounded read per category; never the whole table.
 *
 * A category slug is only unambiguous together with its `app_type` (`sports` is both an app category
 * and a game genre), so every read is keyed by the pair, and the pair is what comes back.
 *
 * Rules, shared with `lib/catalog-shelf.ts` (the same constants and the same first-party rule):
 * - A row whose `package_name` matches a first-party app's is dropped (first-party wins). The caller
 *   already has the first-party apps and shows them in their own shelf.
 * - `perCategory` is at most `SHELF_MAX`; each category is read in at most `SHELF_MAX_PAGES` pages.
 * - The number of categories is at most `CATEGORY_ROWS_MAX`, and at most `CATEGORY_ROWS_CONCURRENCY`
 *   reads are in flight at once, so one home render is a small, fixed number of requests.
 * - A pair repeated in the input is read once and keeps its first position. Output order is input
 *   order, so the caller decides the order of the rows on the page.
 * - A category with no apps (including one nobody has been re-derived into yet) comes back as a row
 *   with an empty `apps` array. It is not an error and not omitted; the layout decides to render
 *   nothing for it.
 *
 * Contract: never throws. `null` means "could not answer": not configured, a bad argument (too many
 * categories, a bad `app_type` or category slug, a bad count) or ANY failed or refused read. A partial
 * answer is never returned, because a missing row would look like an empty category. Nothing is logged
 * here, and no slug list or key appears in any message.
 *
 * Not decided here: which categories to ask for, or in what order (the caller), and whether
 * `uncategorized` gets a row (the caller; this module reads it like any other slug).
 */

import {
  CATALOG_PAGE_MAX,
  readCatalogPage,
  type CatalogAppType,
  type CatalogTableDeps,
} from "./catalog-table";
import { SHELF_MAX, SHELF_MAX_PAGES } from "./catalog-shelf";
import type { App } from "./mock-data";
import { appFromCatalogRow } from "./sources/catalog-table";

/** Most categories one call will read. A home page shows a few rows, not the taxonomy. */
export const CATEGORY_ROWS_MAX = 32;
/** Reads in flight at once; keeps one render from opening dozens of connections. */
export const CATEGORY_ROWS_CONCURRENCY = 4;

export interface CategoryRowSpec {
  appType: CatalogAppType;
  /** A slug as `taxonomySlug` writes it, e.g. `health-and-fitness`. */
  category: string;
}

export interface CategoryRowData {
  appType: CatalogAppType;
  category: string;
  /** At most `perCategory` apps, in `top` order; empty when the category has none. */
  apps: App[];
}

/** One category: the first `want` non-colliding apps, or `null` if any page could not be read. */
async function readOne(
  spec: CategoryRowSpec,
  want: number,
  firstPartyPackages: ReadonlySet<string>,
  deps: CatalogTableDeps
): Promise<App[] | null> {
  // Ask for enough to cover the first-party apps that could collide, in one page where possible.
  const limit = Math.min(CATALOG_PAGE_MAX, want + firstPartyPackages.size);
  const taken = new Set<string>(firstPartyPackages);
  const out: App[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < SHELF_MAX_PAGES; page += 1) {
    const result = await readCatalogPage(
      { order: "top", appType: spec.appType, category: spec.category, cursor, limit },
      deps
    );
    if (!result.ok) return null;
    for (const row of result.rows) {
      if (taken.has(row.package_name)) continue;
      taken.add(row.package_name);
      out.push(appFromCatalogRow(row));
      if (out.length >= want) return out;
    }
    // The category ran out of rows: a short list is the true answer, including an empty one.
    if (!result.nextCursor) return out;
    cursor = result.nextCursor;
  }
  // Ran out of pages before filling the row: a short answer would look complete, so refuse it.
  return null;
}

export async function readCategoryRows(
  specs: readonly CategoryRowSpec[],
  perCategory: number,
  firstParty: readonly App[],
  deps: CatalogTableDeps = {}
): Promise<CategoryRowData[] | null> {
  if (!Array.isArray(specs) || specs.length > CATEGORY_ROWS_MAX) return null;
  if (!Number.isInteger(perCategory) || perCategory < 0 || perCategory > SHELF_MAX) return null;

  // One read per distinct pair, in first-seen order. A malformed entry refuses the whole call.
  const unique: CategoryRowSpec[] = [];
  const seen = new Set<string>();
  for (const spec of specs) {
    if (spec === null || typeof spec !== "object") return null;
    const { appType, category } = spec;
    if (appType !== "app" && appType !== "game") return null;
    if (typeof category !== "string" || category === "") return null;
    const key = `${appType}/${category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ appType, category });
  }

  if (perCategory === 0) return unique.map((s) => ({ appType: s.appType, category: s.category, apps: [] }));
  if (unique.length === 0) return [];

  const firstPartyPackages = new Set<string>();
  for (const app of firstParty ?? []) if (app?.package_name) firstPartyPackages.add(app.package_name);

  const results: (App[] | null)[] = new Array(unique.length).fill(null);
  let next = 0;
  let failed = false;

  // A small worker pool: each worker takes the next unread category until none are left or one fails.
  async function worker(): Promise<void> {
    while (!failed) {
      const index = next;
      next += 1;
      if (index >= unique.length) return;
      let apps: App[] | null;
      try {
        apps = await readOne(unique[index], perCategory, firstPartyPackages, deps);
      } catch {
        apps = null; // readCatalogPage never throws; this guards the contract against a future change.
      }
      if (apps === null) {
        failed = true;
        return;
      }
      results[index] = apps;
    }
  }

  const workers = Math.min(CATEGORY_ROWS_CONCURRENCY, unique.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  if (failed) return null;

  const out: CategoryRowData[] = [];
  for (let i = 0; i < unique.length; i += 1) {
    const apps = results[i];
    if (apps === null) return null; // cannot happen when `failed` is false; never return a gap.
    out.push({ appType: unique[i].appType, category: unique[i].category, apps });
  }
  return out;
}
