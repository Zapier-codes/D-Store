"use client";

import { useEffect, useRef } from "react";
import { recordView } from "@/lib/view-history";

/**
 * Local view-history recorder — leaf `4.d.ii.zo`. Sits alongside
 * `ViewPing` on the app detail page but is a deliberately separate
 * component, not an addition to it: `ViewPing` fires a `fetch` to
 * increment this store's *sitewide public* view counter (`3.b.i.zo`);
 * this one writes to `lib/view-history.ts`'s *per-device, local-only*
 * store, which powers `ForYouShelf`'s personalization and never leaves
 * this browser. Keeping them separate keeps `ViewPing` free of a
 * personalization concern it was never scoped for, and keeps this
 * recorder free of any network call — it's a synchronous
 * `localStorage` write, nothing to fail-soft against a server for.
 *
 * Same `useRef` double-fire guard as `ViewPing`, for the same reason
 * (React Strict Mode double-invokes effects in `next dev`) — without
 * it, a single page load in development would push the same app to the
 * front of the history twice in a row (harmless here since `recordView`
 * already dedupes by slug, but the guard is free and keeps the two
 * components' shape consistent).
 */
export default function ViewHistoryRecorder({ appSlug, category }: { appSlug: string; category: string }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    recordView({ slug: appSlug, category });
  }, [appSlug, category]);

  return null;
}
