import Link from "next/link";
import type { Category } from "@/lib/catalog";
import styles from "./CategoryCard.module.css";

/**
 * Category card — leaf 0.g.ii.zi (Search & Category Browse → Category
 * browse). The per-category unit populating the `/categories` grid,
 * mirroring `AppCard` (0.c.ii.zo) closely: same `ShelfGrid`-compatible
 * card shape, same colored-initial-tile icon convention.
 *
 * `Category.icon` (lib/mock-data.ts) is a Material icon *name* string
 * (e.g. "settings"), not an asset — same "no real icon assets exist
 * yet" gap `AppCard` already documents for `App.icon`. Categories also
 * have no per-category color fields the way apps do (`primary_color`/
 * `secondary_color`), so every tile uses the shared `--color-accent`
 * token rather than inventing colors the data doesn't have — honest
 * about what is and isn't real data, same principle as the rest of
 * Phase 0's dummy-value callouts.
 *
 * `appCount` is passed in rather than fetched here — `getCategoryAppCount`
 * (lib/catalog.ts) is async, and fetching per-card inside a list would
 * mean N awaited calls instead of one; the `/categories` page fetches
 * all counts up front and passes each one down.
 */
export default function CategoryCard({
  category,
  appCount,
}: {
  category: Category;
  appCount: number;
}) {
  return (
    <Link href={`/categories/${category.slug}`} className={styles.card}>
      <div className={styles.icon} aria-hidden="true">
        {category.name.trim().charAt(0).toUpperCase()}
      </div>
      <div className={styles.info}>
        <p className={styles.name}>{category.name}</p>
        <p className={styles.count}>
          {appCount} {appCount === 1 ? "app" : "apps"}
        </p>
      </div>
    </Link>
  );
}
