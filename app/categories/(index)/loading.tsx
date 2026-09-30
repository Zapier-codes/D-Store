import ShelfGrid from "@/components/ShelfGrid";
import SkeletonCard from "@/components/SkeletonCard";
import SkeletonBlock from "@/components/SkeletonBlock";
import styles from "./page.module.css";

/**
 * Categories index loading skeleton — leaf 3.a.iii.zi. Reuses
 * `page.module.css`'s own `.main` shell so the grid sits at the same
 * width/padding the real page renders at. `SkeletonCard` (built for
 * `AppCard`'s shape) doubles as the category-card placeholder here —
 * both are icon-plus-two-lines, close enough that a second,
 * near-identical `SkeletonCategoryCard` wasn't worth building (see
 * `SkeletonCard`'s own header comment).
 */
export default function Loading() {
  return (
    <main className={styles.main} role="status" aria-label="Loading">
      <SkeletonBlock width="140px" height="1.5rem" />
      <ShelfGrid>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </ShelfGrid>
    </main>
  );
}
