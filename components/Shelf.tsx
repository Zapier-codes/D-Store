import type { App } from "@/lib/catalog";
import Link from "next/link";
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
 *
 * Optional `seeAllHref` (leaf `5.l.ix.zo`) adds a "See all" link beside the
 * heading, used by the home page's category rows to reach the full
 * category page. Absent, the heading renders exactly as before.
 *
 * Optional `priorityCount` — leaf `3.d.ii.zo` (LCP budget pass). Marks
 * the first `priorityCount` cards' icons `priority` (eager, no
 * lazy-load delay) instead of every card in every shelf, which would
 * just add network contention for images nobody's scrolled to yet.
 * `ShelfGrid`'s narrowest breakpoint is 2 columns, so `2` covers the
 * first visible row on any viewport; callers only pass this for
 * whichever shelf actually renders first below the hero (see
 * `app/page.tsx`), since that's the one shelf whose leading cards are
 * above the fold on first paint.
 */
export default function Shelf({
  title,
  apps,
  extraSlot,
  priorityCount = 0,
  seeAllHref,
  glass = false,
}: {
  title: string;
  apps: App[];
  extraSlot?: React.ReactNode;
  priorityCount?: number;
  seeAllHref?: string;
  /** Operator-directed 2026-10-08 (slice 6): the details page's rails use the glass card and sit flush with the page column (no extra padding, heading in the text colour). */
  glass?: boolean;
}) {
  if (apps.length === 0) return null;

  return (
    <section className={glass ? `${styles.shelf} ${styles.glass}` : styles.shelf} aria-labelledby={`shelf-${slugify(title)}`}>
      {seeAllHref ? (
        <div className={styles.header}>
          <h2 id={`shelf-${slugify(title)}`} className={styles.title}>
            {title}
          </h2>
          <Link href={seeAllHref} className={styles.seeAll} aria-label={`See all ${title}`}>
            See all
          </Link>
        </div>
      ) : (
        <h2 id={`shelf-${slugify(title)}`} className={styles.title}>
          {title}
        </h2>
      )}
      <ShelfGrid compact={glass}>
        {apps.map((app, index) => (
          <AppCard key={app.slug} app={app} priority={index < priorityCount} glass={glass} />
        ))}
        {extraSlot}
      </ShelfGrid>
    </section>
  );
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
