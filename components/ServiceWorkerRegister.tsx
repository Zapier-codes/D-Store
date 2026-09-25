"use client";

import { useEffect } from "react";

/**
 * Service worker registration — leaf 4.b.i.zo, the registration half
 * of the pair with `public/sw.js` (see that file's own header comment
 * for what it actually does once registered).
 *
 * Renders nothing — same "the only job is a side effect on mount"
 * shape as `ScrollReveal`'s `IntersectionObserver` setup, just with an
 * empty render instead of wrapping `children`, since there's no DOM
 * node this needs to attach to. Feature-detected (`"serviceWorker" in
 * navigator`) rather than assumed, since this still needs to run
 * harmlessly in any browser without the API (older Safari versions,
 * non-browser test environments) — same defensive-by-default posture
 * `lib/ipapi.ts` (0.h.i.zi) already established for a different
 * browser API gap.
 *
 * Mounted from `app/layout.tsx` alongside `Header`/`Footer` so it
 * registers on every page, not just the home page — the worker's own
 * navigation-fallback behavior (`public/sw.js`) needs to be active
 * regardless of which page a visitor's session started on.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration can fail for reasons outside this app's control
      // (browser policy in a private/incognito window, an extension
      // blocking it, etc.) — same "fail soft, never block rendering"
      // rule `lib/ipapi.ts`'s region lookup already follows. The rest
      // of the site works identically online with no service worker
      // at all; only the offline fallback (`/offline`) and the
      // runtime `_next/static` cache are unavailable.
    });
  }, []);

  return null;
}
