import ShelfGrid from "@/components/ShelfGrid";
import SkeletonCard from "@/components/SkeletonCard";
import SkeletonBlock from "@/components/SkeletonBlock";
import styles from "./page.module.css";

/**
 * Per-category apps listing loading skeleton — leaf 3.a.iii.zi. Same
 * approach as `/categories`'s own skeleton (same page shell, same
 * `SkeletonCard` grid) — see that file's header comment.
 */
export default function Loading() {
  return (
    <main className={styles.main} role="status" aria-label="Loading">
      <SkeletonBlock width="160px" height="1.5rem" />
      <ShelfGrid>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </ShelfGrid>
    </main>
  );
}
