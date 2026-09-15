import { cookies } from "next/headers";

/**
 * Cookie consent persistence — leaf 2.d.ii.zi (Legal & Compliance,
 * Consent).
 *
 * Mirrors the lib/theme.ts / lib/theme-actions.ts split (0.b.iii.zi,
 * 0.c.i.zo): a "use server" write-side module may only export async
 * functions, so the constant/read function server *components* import
 * lives here, and the write side lives in lib/consent-actions.ts.
 *
 * Scope check against D-STORE.md §4.F: "Cookie/ad consent banner ...
 * Required once ad infrastructure goes live." No ad infrastructure
 * exists yet anywhere in this repo — the only two cookies D-Store
 * actually sets today are d-store-theme (0.b.iii.zi) and
 * d-store-region (0.h.i.zo), both strictly functional and described
 * in the Privacy Policy (2.d.i.zi) as never used for tracking or
 * advertising. So this banner is honest about being ahead of the ad
 * infra it's built for: it discloses the two functional cookies that
 * exist today, and acknowledging it doesn't gate or unlock anything —
 * there's no ad/tracking consent to actually grant yet, just a
 * disclosure to acknowledge. The banner (and this cookie's plumbing)
 * exists now so the UI is already in place before real ad
 * infrastructure needs something to gate on.
 */

export const CONSENT_COOKIE_NAME = "d-store-consent";

/**
 * Reads whether the visitor has acknowledged the cookie notice.
 * Call this from a server component (the root layout, same pattern as
 * getTheme()/getRegion()) so the banner's initial visibility is
 * correct in the first server-rendered HTML — no flash of the banner
 * for a returning visitor who already acknowledged it.
 */
export async function hasGivenConsent(): Promise<boolean> {
  const store = await cookies();
  return store.get(CONSENT_COOKIE_NAME)?.value === "acknowledged";
}
