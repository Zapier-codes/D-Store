import ShelfGrid from "./ShelfGrid";
import SkeletonCard from "./SkeletonCard";
import SkeletonBlock from "./SkeletonBlock";
import shelfStyles from "./Shelf.module.css";

/**
 * Shelf-shaped skeleton — leaf 3.a.iii.zi. Mirrors `Shelf`'s (0.d.ii.zi)
 * own footprint: a title bar above a `ShelfGrid` (0.c.ii.zi) of cards.
 * Reuses `Shelf.module.css`'s exported `.shelf`/`.title` class names
 * directly rather than duplicating that padding/sizing into a new
 * file — a skeleton title bar sized to `.title`'s own font-size (via
 * `SkeletonBlock`'s height prop) lines up with where the real text
 * will render.
 *
 * `count` defaults to 6 — a plausible shelf width across the
 * 2→6-column breakpoints `ShelfGrid` already steps through, not tied
 * to any real shelf's actual app count (which isn't known yet — that's
 * the whole reason this exists).
 */
export default function SkeletonShelf({ count = 6 }: { count?: number }) {
  return (
    <div className={shelfStyles.shelf}>
      <div className={shelfStyles.title}>
        <SkeletonBlock width="140px" height="1.1rem" />
      </div>
      <ShelfGrid>
        {Array.from({ length: count }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </ShelfGrid>
    </div>
  );
}
