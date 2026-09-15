import SkeletonBlock from "./SkeletonBlock";
import styles from "./SkeletonCard.module.css";

/**
 * Card-shaped skeleton — leaf 3.a.iii.zi. Mirrors `AppCard`'s
 * (0.c.ii.zo) own footprint (icon tile + name lines + meta line) so
 * swapping a grid of these for real `AppCard`s once data resolves
 * doesn't shift layout. Reused as-is for `CategoryCard`'s grid too
 * (`/categories`) — close enough in shape (icon + text) that a second,
 * near-identical skeleton wasn't worth building for that one page.
 */
export default function SkeletonCard() {
  return (
    <div className={styles.card}>
      <span className={styles.icon} aria-hidden="true" />
      <div className={styles.info}>
        <SkeletonBlock width="90%" height="0.85rem" />
        <SkeletonBlock width="50%" height="0.75rem" />
      </div>
    </div>
  );
}
