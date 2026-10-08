import SkeletonBlock from "@/components/SkeletonBlock";
import styles from "./page.module.css";
import skeletonStyles from "./loading.module.css";

/**
 * App detail page loading skeleton — leaf 3.a.iii.zi. Reuses
 * `page.module.css`'s `.main` so the page shell sits where the real page
 * (`page.tsx`) renders it. Operator-directed 2026-10-08 (slice 1 of the
 * details page rework): the header is now a glass card (`AppHeader`), so
 * the skeleton shows one block of about its height instead of the old
 * icon-and-bars row.
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
      {/* Stands in for the glass header card (components/AppHeader.tsx): a full-width block of about its height, so the swap does not shift the page. */}
      <SkeletonBlock width="100%" height="380px" className={skeletonStyles.section} />

      <SkeletonBlock width="100%" height="220px" className={skeletonStyles.section} />
      <SkeletonBlock width="100%" height="140px" className={skeletonStyles.section} />
      <SkeletonBlock width="100%" height="140px" className={skeletonStyles.section} />
    </main>
  );
}
