/**
 * The shared paged read for list pages — leaf `5.l.x.zi`.
 *
 * SERVER-ONLY (it calls `lib/catalog-table.ts`). Table mode only: `lib/catalog.ts` uses it when
 * the Supabase env is set (`useCatalogTable`, leaf `5.l.xvii.zi`). No page uses it yet; the Top Free
 * chart (`5.l.x.zo`), New & Updated (`5.l.xi.zi`), All apps (`5.l.xi.zo`) and the category page
 * (`5.l.xii.zi`) each become one call to `readAppsPage`.
 *
 * What a page is:
 * - Page 1 (no valid `after`): the first-party (Zealot) apps that match the scope, then third-party
 *   rows to fill the page. First-party apps are not rows, so they come from the caller's list and
 *   are never repeated on a later page.
 * - Later pages: third-party rows only, starting after the cursor.
 * - `pageSize` is the page's total (first-party apps count toward it on page 1), at least 1 and at
 *   most `CATALOG_PAGE_MAX`. If there are more first-party apps than `pageSize`, page 1 still shows
 *   them all and one third-party row, so the page can always move forward.
 *
 * Rules, shared with `lib/catalog-shelf.ts`:
 * - A row whose `package_name` is a first-party app's is dropped on every page (first-party wins),
 *   and the page is filled from the next row.
 * - Order is the database's own (`top`: reported downloads then slug; `new`: source update time).
 *   First-party apps keep the list's order for `top` and go newest-updated first for `new`.
 * - The cursor is the keyset cursor of `lib/catalog-table.ts`, made from the last row actually
 *   shown (not the last row read), so a dropped row never shifts the next page. There are no page
 *   numbers and no totals: a keyset reader can only say "the page after this one".
 *
 * Contract: never throws. `null` means "could not answer": not configured, a bad argument or a
 * failed or refused read; a partial page is never returned. `nextCursor` is `null` on the last page.
 * A bad or foreign `after` is a first page, not an error. Nothing is logged here.
 */

import {
  CATALOG_PAGE_DEFAULT,
  CATALOG_PAGE_MAX,
  CATALOG_SEARCH_MAX_CHARS,
  decodeCursor,
  encodeCursor,
  readCatalogPage,
  searchCatalogPage,
  type CatalogAppType,
  type CatalogOrder,
  type CatalogRow,
  type CatalogTableDeps,
} from "./catalog-table";
import type { App } from "./mock-data";
import { appFromCatalogRow } from "./sources/catalog-table";

/** Pages read to fill one page; only reached when many rows collide with first-party packages. */
export const APPS_PAGE_MAX_READS = 4;
export { CATALOG_PAGE_DEFAULT as APPS_PAGE_SIZE };

export interface AppsPageScope {
  /** Restrict to apps or games. Required when `category` is given. */
  appType?: CatalogAppType;
  /** A category slug inside `appType`. */
  category?: string;
}

export interface AppsPageArgs {
  scope?: AppsPageScope;
  order: CatalogOrder;
  /** The `after` value from the URL, as a framework hands it over (anything). Invalid = first page. */
  after?: unknown;
  /** Default 24. */
  pageSize?: number;
  /** The caller's first-party list (`getFirstPartyList`), used on page 1 and for the package rule. */
  firstParty: readonly App[];
  /**
   * Leaf `5.l.xii.zi`: replaces the built-in first-party scope test (a direct comparison of the
   * stored `app_type` and `category`) when the caller's own rule is wider, as the category page's
   * read-time shim is (a first-party app still carrying a legacy category slug belongs to its Play
   * equivalent). It only chooses which first-party apps lead page 1; the database read still uses
   * `scope`. Absent, behaviour is exactly as before.
   */
  matchFirstParty?: (app: App) => boolean;
  /**
   * Leaf `5.l.xii.zo`: an exact license and/or a maximum size in MB. Passed to the database read for
   * third-party rows and applied here to the first-party apps (they are not rows), with the same
   * tests `getApps` uses: `license` equal, `size_mb` at most the limit. Values must already be
   * valid (`readCatalogPage` refuses a bad one, which makes the whole page `null`).
   */
  filter?: { license?: string; maxSizeMb?: number };
  /**
   * Leaf `5.l.v.zo`: search. A needle matched case-insensitively as a substring of name or summary,
   * the rule `searchApps` applies. Third-party rows come from `searchCatalogPage` (`top` order, one
   * app type at most); first-party apps are matched here with the same rule and lead page 1. A
   * blank needle is an empty page with no request. It is not combinable with a category, a
   * `matchFirstParty`, a `filter` or order `new`: those are `null`, because the database search has
   * no form for them. The needle is trimmed and cut to `CATALOG_SEARCH_MAX_CHARS` characters on
   * both sides, so first-party and database matching agree.
   */
  query?: string;
}

export interface AppsPage {
  apps: App[];
  /** Opaque; pass it back as `after` for the next page. `null` on the last page. */
  nextCursor: string | null;
  /** True for page 1 (the one with first-party apps). */
  isFirstPage: boolean;
}

/** The `after` value a page link should carry: a valid cursor for `order`, or `undefined`. */
export function parseAfter(order: CatalogOrder, value: unknown): string | undefined {
  const one = Array.isArray(value) ? value[0] : value;
  return decodeCursor(order, one) ? (one as string) : undefined;
}

/** Largest rank offset a URL can carry; far above the table's size, so it only guards garbage. */
export const RANK_OFFSET_MAX = 1_000_000;

/**
 * The `n` of a ranked page's URL: how many ranked rows came before this page. DISPLAY ONLY. It
 * numbers the cards and is never used to read data, so a wrong or hostile value can only show a
 * wrong number. Anything that is not a whole number from 0 to `RANK_OFFSET_MAX` is 0, and the
 * first page (no valid `after`) is always 0, whatever `n` says.
 */
export function parseRankOffset(value: unknown, isFirstPage: boolean): number {
  if (isFirstPage) return 0;
  const one = Array.isArray(value) ? value[0] : value;
  if (typeof one !== "string" || !/^\d{1,7}$/.test(one)) return 0;
  const n = Number(one);
  return n <= RANK_OFFSET_MAX ? n : 0;
}

function inScope(app: App, scope: AppsPageScope): boolean {
  if (scope.appType && app.app_type !== scope.appType) return false;
  if (scope.category && app.category !== scope.category) return false;
  return true;
}

/** The needle both sides use: trimmed, cut to the search cap, trimmed again. Empty = match nothing. */
export function normalizeNeedle(query: string): string {
  return Array.from(query.trim()).slice(0, CATALOG_SEARCH_MAX_CHARS).join("").trim();
}

function firstPartyForPage(
  firstParty: readonly App[],
  scope: AppsPageScope,
  order: CatalogOrder,
  match?: (app: App) => boolean,
  filter?: { license?: string; maxSizeMb?: number }
): App[] {
  const own = firstParty.filter(
    (app) =>
      app.origin === "zealot" &&
      (match ? match(app) : inScope(app, scope)) &&
      (filter?.license === undefined || app.license === filter.license) &&
      (filter?.maxSizeMb === undefined || app.size_mb <= filter.maxSizeMb)
  );
  if (order === "top") return own;
  return [...own].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at) || 0);
}

export async function readAppsPage(args: AppsPageArgs, deps: CatalogTableDeps = {}): Promise<AppsPage | null> {
  try {
    const scope = args.scope ?? {};
    const pageSize = args.pageSize ?? CATALOG_PAGE_DEFAULT;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > CATALOG_PAGE_MAX) return null;
    if (args.order !== "top" && args.order !== "new") return null;

    const after = parseAfter(args.order, args.after);
    const isFirstPage = after === undefined;

    // Search (5.l.v.zo): `needle` is undefined when this is not a search.
    let needle: string | undefined;
    let match = args.matchFirstParty;
    if (args.query !== undefined) {
      if (typeof args.query !== "string") return null;
      if (args.order !== "top" || scope.category !== undefined || args.matchFirstParty || args.filter) return null;
      needle = normalizeNeedle(args.query);
      if (needle === "") return { apps: [], nextCursor: null, isFirstPage }; // blank: nothing, no request
      const lower = needle.toLowerCase();
      match = (app) => app.name.toLowerCase().includes(lower) || app.summary.toLowerCase().includes(lower);
    }

    const own = isFirstPage ? firstPartyForPage(args.firstParty, scope, args.order, match, args.filter) : [];

    const taken = new Set<string>();
    for (const app of args.firstParty) if (app.package_name) taken.add(app.package_name);

    // Page 1 shares the page with the first-party apps, but always asks for at least one row.
    const want = Math.max(1, pageSize - own.length);
    const limit = Math.min(CATALOG_PAGE_MAX, want + args.firstParty.length);

    const shown: CatalogRow[] = [];
    let cursor = after;
    let more = false;
    let nextCursor: string | null = null;

    for (let read = 0; read < APPS_PAGE_MAX_READS; read += 1) {
      const result =
        needle !== undefined
          ? await searchCatalogPage({ query: needle, appType: scope.appType, cursor, limit }, deps)
          : await readCatalogPage(
              {
                order: args.order,
                appType: scope.appType,
                category: scope.category,
                cursor,
                limit,
                license: args.filter?.license,
                maxSizeMb: args.filter?.maxSizeMb,
              },
              deps
            );
      if (!result.ok) return null;

      for (let i = 0; i < result.rows.length; i += 1) {
        const row = result.rows[i];
        if (taken.has(row.package_name)) continue;
        taken.add(row.package_name);
        shown.push(row);
        if (shown.length >= want) {
          // Rows left in this read, or another read after it, mean another page exists.
          more = i < result.rows.length - 1 || result.nextCursor !== null;
          break;
        }
      }

      if (shown.length >= want) break;
      if (!result.nextCursor) break; // the table has no more rows: a short last page
      cursor = result.nextCursor;
      if (read === APPS_PAGE_MAX_READS - 1) return null; // could not fill it: a short page would look final
    }

    if (more) {
      nextCursor = encodeCursor(args.order, shown[shown.length - 1]);
      if (nextCursor === null) return null; // a row that cannot make a cursor: refuse, do not truncate
    }

    return { apps: [...own, ...shown.map(appFromCatalogRow)], nextCursor, isFirstPage };
  } catch {
    return null;
  }
}
