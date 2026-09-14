import type { App } from "@/lib/catalog";
import ShelfGrid from "./ShelfGrid";
import AppCard from "./AppCard";
import styles from "./Shelf.module.css";

/**
 * Titled shelf — leaf 0.d.ii.zi (Home Page → Shelves → Featured shelf).
 *
 * A shelf is a heading plus a `ShelfGrid` (0.c.ii.zi) of `AppCard`s
 * (0.c.ii.zo) — the repeating unit the home page stacks (Featured here,
 * then Trending in 0.d.ii.zo, Editor's Picks in 0.d.iii.zi). Pulled out
 * as its own component rather than inlined in `app/page.tsx` so those
 * next leaves reuse this instead of re-deriving the title+grid markup.
 *
 * Renders nothing when `apps` is empty (e.g. a future region filter,
 * 0.h.ii.zo, narrows a shelf to zero results) rather than showing an
 * empty heading. An empty `apps` array still suppresses the whole
 * shelf even when `extraSlot` is passed — a shelf that's just an ad
 * with no curated apps around it isn't "woven into listings" per
 * docs/D-STORE.md §6, it's an interstitial.
 *
 * `extraSlot` (0.d.iii.zo) is an optional non-`App` node — the
 * sponsored card slot — rendered inside the same `ShelfGrid` after the
 * real apps, so it reads as woven into the listing rather than
 * inserted ahead of the curated order a caller fetched `apps` in.
 * Generic on purpose (not `sponsored?: boolean`) so this stays a plain
 * layout component with no knowledge of what a sponsored card is.
 */
export default function Shelf({
  title,
  apps,
  extraSlot,
}: {
  title: string;
  apps: App[];
  extraSlot?: React.ReactNode;
}) {
  if (apps.length === 0) return null;

  return (
    <section className={styles.shelf} aria-labelledby={`shelf-${slugify(title)}`}>
      <h2 id={`shelf-${slugify(title)}`} className={styles.title}>
        {title}
      </h2>
      <ShelfGrid>
        {apps.map((app) => (
          <AppCard key={app.slug} app={app} />
        ))}
        {extraSlot}
      </ShelfGrid>
    </section>
  );
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
