import Link from "next/link";
import type { Collection } from "@/lib/catalog";
import AppIcon from "./AppIcon";
import styles from "./CollectionCard.module.css";

/**
 * Collection card — leaf `4.c.ii.zo`. The per-collection unit
 * populating the `/collections` grid, mirroring `CategoryCard`
 * (`0.g.ii.zi`) closely: same `ShelfGrid`-compatible card shape, same
 * "no per-item color fields, so the tile uses the shared accent token"
 * treatment `CategoryCard` already established for exactly the same
 * reason (a `Collection`, like a `Category`, has no `primary_color`/
 * `secondary_color` of its own — apps do, collections don't).
 *
 * Shows `description` instead of `CategoryCard`'s app-count line as
 * the card's second line — a collection's whole point is *why* these
 * apps are grouped, which a bare count can't convey; `appCount` is
 * still shown, just folded into a shorter meta line beneath it rather
 * than replacing it.
 */
export default function CollectionCard({
  collection,
  appCount,
}: {
  collection: Collection;
  appCount: number;
}) {
  return (
    <Link href={`/collections/${collection.slug}`} className={styles.card}>
      <div className={styles.icon}>
        <AppIcon
          name={collection.name}
          primaryColor="var(--color-accent)"
          secondaryColor="var(--color-accent-strong)"
          tertiaryColor="var(--color-surface)"
        />
      </div>
      <div className={styles.info}>
        <p className={styles.name}>{collection.name}</p>
        <p className={styles.description}>{collection.description}</p>
        <p className={styles.count}>
          {appCount} {appCount === 1 ? "app" : "apps"}
        </p>
      </div>
    </Link>
  );
}
