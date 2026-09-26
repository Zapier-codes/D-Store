"use client";

import { useFavorite } from "@/lib/favorites";
import styles from "./FavoriteButton.module.css";

/**
 * Favorite toggle — leaf `4.d.i.zi`. Sits in the app detail page's
 * `installRow`, next to Share (`4.c.ii.zi`) — same "sits beside
 * Install/Download" placement `ShareButton` already established for a
 * secondary per-app action.
 *
 * No login: this simply flips this device's IndexedDB record
 * (`lib/favorites.ts`) via `useFavorite`. `loaded` gates the pressed
 * state so the very first client render (before the async IndexedDB
 * read resolves) never briefly shows the wrong icon.
 */
export default function FavoriteButton({
  appSlug,
  appName,
  appIcon,
}: {
  appSlug: string;
  appName: string;
  appIcon: string;
}) {
  const { loaded, favorited, toggle } = useFavorite({ slug: appSlug, name: appName, icon: appIcon });
  const isFavorited = loaded && favorited;

  return (
    <button
      type="button"
      className={styles.favoriteButton}
      onClick={toggle}
      aria-pressed={isFavorited}
      aria-label={isFavorited ? `Remove ${appName} from favorites` : `Add ${appName} to favorites`}
    >
      <span aria-hidden="true" className={styles.icon}>
        {isFavorited ? "★" : "☆"}
      </span>
      {isFavorited ? "Saved" : "Save"}
    </button>
  );
}
