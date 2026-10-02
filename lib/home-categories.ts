/**
 * Which categories the home page shows as rows, and how a row is titled and linked — leaf `5.l.ix.zo`.
 *
 * Pure: no I/O, no React. `lib/catalog.ts` reads the rows (`getHomeCategoryRows`), `app/page.tsx`
 * turns them into the category bar and one shelf each with `toHomeCategoryRows`.
 *
 * Decisions, for the operator to overrule:
 * - Twelve pairs, in the order below (the biggest shelves in the `--snapshot` count, with the two
 *   biggest game genres interleaved so the page is not twelve app rows in a row). The list is data:
 *   change it here, up to `CATEGORY_ROWS_MAX` (32) in `lib/catalog-category-rows.ts`.
 * - `uncategorized` is never listed: it is what an app is shown as when nothing placed it, not a
 *   shelf to browse.
 * - Six apps a row (`HOME_CATEGORY_ROW_SIZE`): the six-column grid's one line at desktop width.
 * - A pair the vocabulary does not know, or a row with no apps, yields no row and no bar entry.
 */

import type { CategoryRowData, CategoryRowSpec } from "./catalog-category-rows";
import type { App } from "./mock-data";
import { findTaxonomyCategory } from "./taxonomy";

export const HOME_CATEGORY_ROW_SIZE = 6;

export const HOME_CATEGORY_ROWS: readonly CategoryRowSpec[] = [
  { appType: "app", category: "tools" },
  { appType: "app", category: "music-and-audio" },
  { appType: "app", category: "productivity" },
  { appType: "game", category: "casual" },
  { appType: "app", category: "photography" },
  { appType: "app", category: "entertainment" },
  { appType: "app", category: "communication" },
  { appType: "game", category: "arcade" },
  { appType: "app", category: "video-players-and-editors" },
  { appType: "app", category: "social" },
  { appType: "app", category: "shopping" },
  { appType: "app", category: "health-and-fitness" },
];

export interface HomeCategoryRow {
  appType: "app" | "game";
  category: string;
  /** Shelf heading and bar label: the category name; a game genre gets " games" so `Sports` is not ambiguous. */
  title: string;
  /** The category page: `/categories/<appType>/<slug>`. */
  href: string;
  /** Material Symbols name for the bar chip. */
  icon: string;
  apps: App[];
}

/** Rows to show: only pairs the vocabulary knows that have at least one app, in the given order. Never throws. */
export function toHomeCategoryRows(rows: readonly CategoryRowData[] | null | undefined): HomeCategoryRow[] {
  const out: HomeCategoryRow[] = [];
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!row || !Array.isArray(row.apps) || row.apps.length === 0) continue;
    const entry = findTaxonomyCategory(row.appType, row.category);
    if (!entry) continue;
    out.push({
      appType: row.appType,
      category: row.category,
      title: row.appType === "game" ? `${entry.name} games` : entry.name,
      href: `/categories/${row.appType}/${row.category}`,
      icon: entry.icon,
      apps: row.apps,
    });
  }
  return out;
}
