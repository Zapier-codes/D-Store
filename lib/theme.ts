/**
 * Theme persistence — leaf 0.b.iii.zi
 *
 * Cookie-based storage (no accounts, per D-STORE.md §3: "no login" rules
 * out server-side per-user preference storage) so the theme can be read
 * server-side before the first byte of HTML is sent — that's what avoids
 * a flash of the wrong theme on load, rather than setting the attribute
 * client-side after hydration.
 *
 * This leaf only covers storage + read-on-load. The actual toggle UI
 * (0.c.i.zo) lives in components/ThemeToggle.tsx and calls the write
 * side, `setThemeCookie`, from lib/theme-actions.ts — kept in a
 * separate file because Next.js requires any module containing a
 * "use server" function to export *only* async functions, and this
 * file also needs to export the `Theme` type and constants that
 * server *components* (not actions) import.
 *
 * Out of scope for this leaf: theme toggle UI (0.c.i.zo), transition
 * animation (0.b.iii.zo), system-preference auto-detect (not yet an
 * itemized leaf — see D-STORE.md §4.C).
 */

import { cookies } from "next/headers";

export type Theme = "dark" | "light";

export const THEME_COOKIE_NAME = "d-store-theme";

// Cinematic Gold (0.b.i) ships before Scientific Blue is wired into any
// UI, so "dark" is the safe default for visitors with no cookie yet.
export const DEFAULT_THEME: Theme = "dark";

export function isTheme(value: string | undefined): value is Theme {
  return value === "dark" || value === "light";
}

/**
 * Reads the persisted theme server-side. Call this from a server
 * component (e.g. the root layout) — never from the client — so the
 * correct `data-theme` is present in the initial HTML and there's
 * nothing for the client to swap after hydration.
 */
export async function getTheme(): Promise<Theme> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE_NAME)?.value;
  return isTheme(value) ? value : DEFAULT_THEME;
}
