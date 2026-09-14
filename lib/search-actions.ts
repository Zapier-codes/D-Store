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
 */

import { searchApps, type App } from "@/lib/catalog";

export async function searchAppsAction(query: string): Promise<App[]> {
  return searchApps(query);
}
