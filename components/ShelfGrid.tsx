import styles from "./ShelfGrid.module.css";

/**
 * Responsive shelf-grid — leaf 0.c.ii.zi.
 *
 * The layout primitive shared by every card grid in the app: home-page
 * shelves (0.d.ii — Featured/Trending), the category grid (0.g.ii.i),
 * and the similar-apps rail (0.e/0.g.iii). It only lays out whatever
 * children it's given — the dense app-card itself (0.c.ii.zo) and the
 * dummy-data shelves that use them (0.d) are separate leaves, so this
 * component isn't wired into any page yet.
 *
 * Column counts follow D-STORE.md §3's "Grid reflows 6 → 3 → 2
 * columns" mobile-first rule, with two extra steps (3→4 at tablet)
 * for a smoother reflow than a single jump from 3 to 6 would give:
 *   <480px  → 2 columns
 *   ≥480px  → 3 columns
 *   ≥768px  → 4 columns
 *   ≥1024px → 6 columns
 */
export default function ShelfGrid({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  /** Operator-directed 2026-10-08 (slice 6): a rail inside a column (not the full page width) fits as many cards as the column holds instead of following the viewport's 4 / 6 steps. */
  compact?: boolean;
}) {
  return <div className={compact ? `${styles.grid} ${styles.compact}` : styles.grid}>{children}</div>;
}
