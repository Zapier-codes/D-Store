"use client";

import { useEffect, useState } from "react";
import { listFavorites, type FavoriteRecord } from "@/lib/favorites";
import { getFavoritedAppsAction } from "@/lib/favorites-actions";
import type { App } from "@/lib/catalog";
import ShelfGrid from "@/components/ShelfGrid";
import AppCard from "@/components/AppCard";
import SkeletonCard from "@/components/SkeletonCard";
import EmptyState from "@/components/EmptyState";
import styles from "./page.module.css";

/**
 * "Saved apps" view — leaf `4.d.i.zo`, second of two `4.d.i` leaves.
 * Reads the same per-device IndexedDB store `4.d.i.zi` built
 * (`lib/favorites.ts`) — no login, same as everywhere else in this
 * repo that's local-only personalization (install status, theme,
 * ratings).
 *
 * A client component, not the usual server-component page shape every
 * other listing page here uses (`/collections`, `/categories`): the
 * favorites list only exists in this browser's IndexedDB, which a
 * server component has no access to. `listFavorites()` (client-side)
 * gets the saved slugs; `getFavoritedAppsAction` (a server action,
 * `lib/favorites-actions.ts`) resolves them against the live merged
 * catalog for real card data — same "IndexedDB record is a lightweight
 * pointer, not a data cache" split `useFavorite`'s own `FavoriteRecord`
 * shape already implies (it only carries slug/name/icon, not a full
 * `App`).
 *
 * Three states: loading (skeleton grid, same shape `SkeletonShelf`
 * already uses elsewhere for an async fetch), empty (`EmptyState`,
 * `kind="filter"` — "nothing here yet" reads the same as an empty
 * filtered category, no new icon needed for one more empty case), and
 * populated (the same `ShelfGrid`/`AppCard` pairing every other
 * listing page uses, so a saved app renders identically to its card
 * anywhere else in the app — including a since-removed favorite's
 * `Third-party`/`Editors' Pick` badges staying accurate, since this
 * always re-fetches live data rather than trusting the stored record).
 *
 * A removed-from-catalog favorite is silently dropped by
 * `getFavoritedAppsAction`, not shown as a broken card — its stale
 * IndexedDB record is left in place rather than actively pruned here
 * (out of scope for this leaf; the record simply never resolves to a
 * card again unless the app returns to the catalog).
 */
export default function SavedPage() {
  const [loaded, setLoaded] = useState(false);
  const [apps, setApps] = useState<App[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const favorites: FavoriteRecord[] = await listFavorites();
      const resolved = await getFavoritedAppsAction(favorites.map((f) => f.slug));
      if (!cancelled) {
        setApps(resolved);
        setLoaded(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Saved apps</h1>

      {!loaded ? (
        <ShelfGrid>
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </ShelfGrid>
      ) : apps.length === 0 ? (
        <EmptyState
          kind="filter"
          heading="No saved apps yet"
          message="Tap Save on any app's page to keep it here for later — it's stored on this device only, no account needed."
          action={{ href: "/", label: "Browse apps" }}
        />
      ) : (
        <ShelfGrid>
          {apps.map((app) => (
            <AppCard key={app.slug} app={app} />
          ))}
        </ShelfGrid>
      )}
    </main>
  );
}
