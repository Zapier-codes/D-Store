"use client";

import { useEffect, useRef } from "react";

/**
 * View-count ping — leaf `3.b.i.zo`. Renders nothing; its only job is
 * to fire the view-count increment once per app-detail page load,
 * mirroring `InstallButton`'s fire-and-forget POST to the install-count
 * endpoint (`3.b.i.zi`) but on mount instead of on click, since a
 * "view" is the page loading, not a user action taken on it.
 *
 * A plain client component rather than folding this into the page
 * itself: `app/app/[slug]/page.tsx` is a Server Component (it awaits
 * `getAppBySlug` etc. directly), and firing a `fetch` on mount needs
 * `useEffect`, which only runs in a Client Component — same reason
 * `InstallButton` and `RateThisApp` are already "use client" leaves
 * hanging off an otherwise-server-rendered page.
 *
 * `useRef` guards against a double-fire from React's Strict Mode
 * double-invoking effects in development — without it, `next dev`
 * would double count every view; `next start`/production isn't
 * affected either way, but the guard is free and correct in both.
 * Errors are swallowed, same as the install counter: a failed ping
 * must never surface anything to the visitor.
 */
export default function ViewPing({ appSlug }: { appSlug: string }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    fetch(`/api/apps/${appSlug}/view`, { method: "POST" }).catch(() => {});
  }, [appSlug]);

  return null;
}
