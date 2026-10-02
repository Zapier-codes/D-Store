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
 * apps to the browser; `null` (table off, or a failed read) falls back to `searchApps` as before.
 * Never logs the query: only `/search` does.
 */

import { searchApps, getSearchPage, type App } from "@/lib/catalog";

const SUGGESTION_COUNT = 6;

export async function searchAppsAction(query: string): Promise<App[]> {
  const page = await getSearchPage(query, undefined, SUGGESTION_COUNT);
  return page ? page.apps : searchApps(query);
}
