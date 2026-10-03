"use server";

/**
 * Search — server action side (leaf 0.g.i.zi, instant search
 * suggestions). Separated from lib/catalog.ts the same way
 * lib/theme-actions.ts is separated from lib/theme.ts: a "use server"
 * module may only export async functions, and lib/catalog.ts also
 * exports the `App`/`Category` types and the `GetAppsOptions`
 * interface that server *components* need, which can't share a file
 * with a "use server" directive.
 *
 * Thin wrapper, not a reimplementation — `searchApps` (lib/catalog.ts)
 * already has the matching logic and its simulated latency; this file
 * exists purely so a client component (SearchBar) can call it.
 *
 * Leaf `5.l.v.zo`: in table mode the dropdown asks for one small page (`getSearchPage`, 6 apps, the
 * number `SearchBar` shows) instead of every match, so a keystroke no longer serializes thousands of
 * apps to the browser. Leaf `5.l.xxi.zo`: `getSearchPage` now throws `CatalogUnavailableError` when the
 * catalog cannot be read (an unusable Supabase env counts); this action catches only that error and
 * answers the first-party matches (`searchApps`, first-party only) cut to the same six, with no notice:
 * a dropdown has no room for one, and a short list of suggestions is not wrong. Any other error is not
 * caught. Never logs the query: only `/search` does.
 */

import { CatalogUnavailableError, searchApps, getSearchPage, type App } from "@/lib/catalog";

const SUGGESTION_COUNT = 6;

export async function searchAppsAction(query: string): Promise<App[]> {
  try {
    return (await getSearchPage(query, undefined, SUGGESTION_COUNT)).apps;
  } catch (error) {
    if (!(error instanceof CatalogUnavailableError)) throw error;
    return (await searchApps(query)).slice(0, SUGGESTION_COUNT);
  }
}
