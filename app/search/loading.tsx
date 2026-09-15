import ShelfGrid from "@/components/ShelfGrid";
import SkeletonCard from "@/components/SkeletonCard";
import SkeletonBlock from "@/components/SkeletonBlock";
import styles from "./page.module.css";

/**
 * Search results loading skeleton — leaf 3.a.iii.zi. Same approach as
 * `/categories`'s skeleton (page shell + `SkeletonCard` grid). Shown
 * regardless of whether a query is present — `app/search/page.tsx` is
 * an async component either way, so Next.js suspends into this on
 * every visit, not just ones with slow results.
 */
export default function Loading() {
  return (
    <main className={styles.main} role="status" aria-label="Loading">
      <SkeletonBlock width="220px" height="1.5rem" />
      <ShelfGrid>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </ShelfGrid>
    </main>
  );
}
