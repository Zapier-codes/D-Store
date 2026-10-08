import SkeletonBlock from "@/components/SkeletonBlock";
import styles from "./page.module.css";
import skeletonStyles from "./loading.module.css";

/**
 * App detail page loading skeleton — leaf 3.a.iii.zi. Reuses `page.module.css`'s `.main`, `.columns`, `.mainCol`
 * and `.side` so the skeleton sits exactly where the real page (`page.tsx`) renders its parts.
 *
 * Operator-directed 2026-10-08: slice 1 made the header a glass card (one block of about its height); slice 7
 * adds the stat strip under it and the two-column shape (a left column of section blocks and, from 1100px, the
 * sticky install card's place on the right, which `.side` hides below that), so the swap to the real page does not
 * shift the layout. The real page has many distinct sections, so the left column shows a handful of generic
 * shimmering blocks standing in for "more content incoming" rather than mirroring every one.
 */
export default function Loading() {
  return (
    <main className={styles.main} role="status" aria-label="Loading">
      {/* The glass header card (components/AppHeader.tsx) and the stat strip under it. */}
      <SkeletonBlock width="100%" height="380px" className={skeletonStyles.section} />
      <SkeletonBlock width="100%" height="88px" className={skeletonStyles.section} />

      <div className={styles.columns}>
        <div className={styles.mainCol}>
          <SkeletonBlock width="100%" height="220px" className={skeletonStyles.section} />
          <SkeletonBlock width="100%" height="140px" className={skeletonStyles.section} />
          <SkeletonBlock width="100%" height="140px" className={skeletonStyles.section} />
        </div>
        {/* The sticky install card's place; hidden below 1100px like the card itself. */}
        <aside className={styles.side} aria-hidden="true">
          <SkeletonBlock width="100%" height="260px" className={skeletonStyles.section} />
        </aside>
      </div>
    </main>
  );
}
