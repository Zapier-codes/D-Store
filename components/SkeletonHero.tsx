import SkeletonBlock from "./SkeletonBlock";
import styles from "./SkeletonHero.module.css";

/**
 * Hero-shaped skeleton — leaf 3.a.iii.zi. Mirrors `Hero`'s (0.d.i.zi)
 * own footprint (icon tile + eyebrow/name/summary/meta/cta bars) at
 * the same padding/gap, so the home page doesn't jump when the real
 * `Hero` mounts in its place. Unlike `Hero` itself, this has no
 * per-app gradient background — there's no app data yet to draw
 * colors from, which is exactly the point of showing this instead.
 */
export default function SkeletonHero() {
  return (
    <div className={styles.hero}>
      <span className={styles.icon} aria-hidden="true" />
      <div className={styles.text}>
        <SkeletonBlock width="70px" height="0.75rem" />
        <SkeletonBlock width="55%" height="1.75rem" className={styles.gapTop} />
        <SkeletonBlock width="85%" height="1rem" className={styles.gapTop} />
        <SkeletonBlock width="40%" height="0.9rem" className={styles.gapTop} />
        <SkeletonBlock width="140px" height="2.5rem" radius="999px" className={styles.gapTop} />
      </div>
    </div>
  );
}
