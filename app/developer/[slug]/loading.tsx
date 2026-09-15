import SkeletonBlock from "@/components/SkeletonBlock";
import SkeletonShelf from "@/components/SkeletonShelf";
import styles from "./page.module.css";
import skeletonStyles from "./loading.module.css";

/**
 * Developer profile loading skeleton — leaf 3.a.iii.zi. Reuses
 * `page.module.css`'s own `.main`/`.header`/`.avatar` classes so the
 * header row lines up with the real page (`page.tsx`), same approach
 * `/app/[slug]`'s skeleton takes with its own header. `SkeletonShelf`
 * stands in for the developer's app list below it.
 */
export default function Loading() {
  return (
    <main className={styles.main} role="status" aria-label="Loading">
      <div className={styles.header}>
        <span className={styles.avatar + " " + skeletonStyles.shimmer} aria-hidden="true" />
        <div>
          <SkeletonBlock width="180px" height="1.5rem" />
          <SkeletonBlock width="120px" height="0.9rem" className={skeletonStyles.gapTop} />
        </div>
      </div>
      <SkeletonBlock width="90%" height="3rem" />
      <SkeletonShelf count={3} />
    </main>
  );
}
