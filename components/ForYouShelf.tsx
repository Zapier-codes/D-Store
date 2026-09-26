"use client";

import { useEffect, useState } from "react";
import { listFavorites } from "@/lib/favorites";
import { listViewHistory } from "@/lib/view-history";
import { getForYouAppsAction } from "@/lib/favorites-actions";
import type { App } from "@/lib/catalog";
import ShelfGrid from "./ShelfGrid";
import AppCard from "./AppCard";
import shelfStyles from "./Shelf.module.css";

/**
 * "For You" row — leaf `4.d.ii.zi`, tuned by `4.d.ii.zo`. Category-
 * affinity recommendations derived from this visitor's local favorites
 * (`lib/favorites.ts`, IndexedDB) and local view history
 * (`lib/view-history.ts`, `localStorage`, added by `4.d.ii.zo`) — see
 * `getCategoryAffinityApps` (`lib/catalog.ts`) for the ranking rule and
 * how the two signals are weighted against each other.
 *
 * A client component, not a `Shelf` usage in `app/page.tsx` directly:
 * both signals only exist in this browser's storage, unreachable from
 * the home page's server component — same reason `/saved` (`4.d.i.zo`)
 * is a client component reading `listFavorites()` and then a server
 * action to resolve real `App` data. `getForYouAppsAction`
 * (`lib/favorites-actions.ts`) is that same "thin wrapper so a client
 * component can call existing `lib/catalog.ts` logic" pattern.
 *
 * Renders nothing — not a loading skeleton, not an empty state — until
 * a non-empty result resolves. Two reasons this differs from `/saved`'s
 * three-state handling: (1) this is one optional row on a page that's
 * already fully rendered and useful without it, not the entire point of
 * a dedicated page, so there's nothing here worth blocking on or
 * reserving skeleton space for; (2) a first-time visitor has neither
 * favorites nor view history yet, so "no shelf" is the common case, not
 * an edge case — showing a "nothing here yet" empty state on the home
 * page for that visitor would be noise, not guidance (`/saved`'s empty
 * state earns its place because a visitor who navigates there already
 * went looking for their saved apps specifically). This mirrors `Shelf`'s
 * own "renders nothing for an empty `apps` array" convention, just
 * decided one layer up since the emptiness here is only knowable after
 * an async storage read + server action round trip, not from a prop
 * already in hand at render time.
 */
export default function ForYouShelf() {
  const [apps, setApps] = useState<App[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const favorites = await listFavorites();
      const viewedCategories = listViewHistory().map((entry) => entry.category);
      if (favorites.length === 0 && viewedCategories.length === 0) return;
      const recommended = await getForYouAppsAction(
        favorites.map((f) => f.slug),
        viewedCategories
      );
      if (!cancelled) setApps(recommended);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (apps.length === 0) return null;

  return (
    <section className={shelfStyles.shelf} aria-labelledby="shelf-for-you">
      <h2 id="shelf-for-you" className={shelfStyles.title}>
        For You
      </h2>
      <ShelfGrid>
        {apps.map((app) => (
          <AppCard key={app.slug} app={app} />
        ))}
      </ShelfGrid>
    </section>
  );
}
