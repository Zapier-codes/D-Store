import Link from "next/link";
import CategoryIcon from "./CategoryIcon";
import styles from "./CategoryCard.module.css";

/**
 * Category card — leaf 0.g.ii.zi (Search & Category Browse → Category
 * browse). The per-category unit populating the `/categories` grid,
 * mirroring `AppCard` (0.c.ii.zo) closely: same `ShelfGrid`-compatible
 * card shape.
 *
 * `Category.icon` (lib/mock-data.ts) is a Material icon *name* string
 * (e.g. "settings"), not an asset. It is drawn as an inline SVG by
 * `CategoryIcon` (the card used to show the name's initial instead, which
 * is what an app with no icon image gets). Categories also
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
  href,
  noun = "app",
}: {
  /** `slug` and `name` are read, and `icon` (a Material Symbols name) when present, so both the legacy `Category` and a two-axis `TaxonomyCategory` fit. */
  category: { slug: string; name: string; icon?: string };
  appCount: number;
  /** `5.i.iv.zi` — defaults to the legacy `/categories/<slug>`; the two-axis pages pass `/categories/<appType>/<slug>`. */
  href?: string;
  /** `5.i.iv.zi` — singular noun for the count ("app", "game"); the plural adds an `s`. */
  noun?: string;
}) {
  return (
    <Link href={href ?? `/categories/${category.slug}`} className={styles.card}>
      <div className={styles.icon}>
        {/* Categories have no per-category color fields, so every tile uses the
            shared accent token. The glyph is the category's own icon, drawn
            inline (components/CategoryIcon.tsx); a category with no icon name
            gets the generic one, never an initial. */}
        <CategoryIcon icon={category.icon ?? ""} className={styles.glyph} />
      </div>
      <div className={styles.info}>
        <p className={styles.name}>{category.name}</p>
        <p className={styles.count}>
          {appCount} {appCount === 1 ? noun : `${noun}s`}
        </p>
      </div>
    </Link>
  );
}
