import SkeletonBlock from "@/components/SkeletonBlock";
import styles from "./page.module.css";
import skeletonStyles from "./loading.module.css";

/**
 * App detail page loading skeleton — leaf 3.a.iii.zi. Reuses
 * `page.module.css`'s `.main`/`.header`/`.icon` classes directly so
 * the header row (icon + name/summary bars) sits at the exact same
 * position/size the real header (`page.tsx`) renders at — no shift
 * on swap.
 *
 * The real page has many distinct sections (screenshots, description,
 * changelog, ratings, verify, Play Store status, permissions, report
 * form, similar apps) — mirroring every one exactly would mean a
 * skeleton nearly as large as the page itself. Instead this shows the
 * header precisely (the part a visitor's eye lands on first) and a
 * handful of generic shimmering section blocks below it
 * (`loading.module.css`'s `.section`) standing in for "more content
 * incoming," which is enough to communicate loading without doubling
 * every section's individual layout.
 */
export default function Loading() {
  return (
    <main className={styles.main} role="status" aria-label="Loading">
      <div className={styles.header}>
        <span className={styles.icon + " " + skeletonStyles.shimmer} aria-hidden="true" />
        <div>
          <SkeletonBlock width="220px" height="1.5rem" />
          <SkeletonBlock width="320px" height="0.95rem" className={skeletonStyles.gapTop} />
        </div>
      </div>

      <SkeletonBlock width="100%" height="220px" className={skeletonStyles.section} />
      <SkeletonBlock width="100%" height="140px" className={skeletonStyles.section} />
      <SkeletonBlock width="100%" height="140px" className={skeletonStyles.section} />
    </main>
  );
}
