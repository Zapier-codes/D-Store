"use server";

/**
 * Theme persistence — write side (leaf 0.c.i.zo, theme toggle
 * integration).
 *
 * Separated from lib/theme.ts because a "use server" module may only
 * export async functions — lib/theme.ts also exports the `Theme` type
 * and constants that server *components* need, which can't share a
 * file with a "use server" directive.
 */

import { cookies } from "next/headers";
import { THEME_COOKIE_NAME, type Theme } from "@/lib/theme";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Server action that persists a theme choice, called from the
 * ThemeToggle client component.
 */
export async function setThemeCookie(theme: Theme): Promise<void> {
  const store = await cookies();
  store.set(THEME_COOKIE_NAME, theme, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });
}
