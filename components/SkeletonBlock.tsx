import styles from "./Skeleton.module.css";

/**
 * Generic shimmering rectangle — leaf 3.a.iii.zi. The one atomic piece
 * every other skeleton component (`SkeletonCard`, `SkeletonHero`,
 * `SkeletonShelf`, and the per-route `loading.tsx` files) is built
 * from, so the animation itself only lives in `Skeleton.module.css`.
 *
 * `aria-hidden` on every block — the loading *state* is announced once
 * by the containing `role="status"` region (each `loading.tsx` does
 * this), not by every individual shimmering rectangle, so a screen
 * reader user hears "Loading" once rather than a wall of unlabeled
 * placeholder divs.
 */
export default function SkeletonBlock({
  width,
  height,
  radius = "6px",
  className,
}: {
  width: string;
  height: string;
  radius?: string;
  className?: string;
}) {
  return (
    <span
      className={[styles.shimmer, className].filter(Boolean).join(" ")}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}
