"use client";

import { useEffect } from "react";
import { listFavorites, onFavoritesChange } from "@/lib/favorites";
import { getPushState, syncSlugs } from "@/lib/push-client";
import { createPushSync } from "@/lib/push-sync";
import { browserPushSupportEnv, getPushSupport, getVapidPublicKey } from "@/lib/push-support";

/**
 * Keeps the server's list of "apps to notify about" equal to this device's
 * favorites — leaf `5.k.ix.zi`. Renders nothing.
 *
 * Mounted in `app/layout.tsx` (beside `ServiceWorkerRegister`), not on `/saved`,
 * because favorites are toggled on the app detail page too.
 *
 * **Inert unless push is configured, supported and switched on.** With no
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (or a malformed one), or a browser that cannot
 * do Web Push, the effect returns before creating anything: no IndexedDB read,
 * no listener, no request. Whether this device has actually opted in
 * (`getPushState() === "on"`) is checked again before every sync, so turning
 * notifications off stops it without a reload.
 *
 * **Recorded decisions:** (1) `onFavoritesChange` is same-tab only and IndexedDB
 * has no cross-tab notification, so a favorite changed in another tab is
 * corrected on the next mount, not live; `BroadcastChannel` is deliberately not
 * added. (2) An empty favorites list stays subscribed to nothing (the server
 * accepts an empty set, `5.k.vi.zi`) rather than unsubscribing the device: the
 * visitor opted in to notifications, and removing their last favorite is not a
 * request to turn them off.
 */
export default function PushSync() {
  useEffect(() => {
    if (getVapidPublicKey() === null) return;
    if (getPushSupport(browserPushSupportEnv()) !== "supported") return;

    const sync = createPushSync({
      gate: async () => (await getPushState()) === "on",
      read: listFavorites,
      send: (slugs) => syncSlugs(slugs),
    });
    const stopListening = onFavoritesChange(sync.request);
    sync.request(); // pick up anything that drifted while the page was closed
    return () => {
      stopListening();
      sync.dispose();
    };
  }, []);

  return null;
}
