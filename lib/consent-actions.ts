"use server";

/**
 * Cookie consent persistence — write side (leaf 2.d.ii.zi).
 *
 * Separated from lib/consent.ts because a "use server" module may only
 * export async functions — lib/consent.ts also exports the
 * CONSENT_COOKIE_NAME constant a server *component* needs, which can't
 * share a file with a "use server" directive. Same split, same reason,
 * as lib/theme.ts / lib/theme-actions.ts (0.b.iii.zi / 0.c.i.zo).
 */

import { cookies } from "next/headers";
import { CONSENT_COOKIE_NAME } from "@/lib/consent";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Server action that records acknowledgment of the cookie notice,
 * called from the ConsentBanner client component.
 */
export async function acknowledgeConsent(): Promise<void> {
  const store = await cookies();
  store.set(CONSENT_COOKIE_NAME, "acknowledged", {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });
}
