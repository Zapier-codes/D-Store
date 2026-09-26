import { getCollections, getCollectionAppCount } from "@/lib/catalog";
import ShelfGrid from "@/components/ShelfGrid";
import CollectionCard from "@/components/CollectionCard";
import styles from "./page.module.css";

/**
 * Collections index page — leaf `4.c.ii.zo` (Editorial collections),
 * same "index page + the per-item page it has to link somewhere real"
 * pattern `0.g.ii.zi` used for `/categories`/`/categories/[slug]`.
 *
 * Counts are fetched once here via `getCollectionAppCount` per
 * collection and passed down, same reasoning `/categories` already
 * documents for its own per-card counts (small, fixed list — one
 * collection today — so N small awaited calls up front beats each
 * card fetching its own).
 */
export default async function CollectionsPage() {
  const items = await getCollections();
  const counts = await Promise.all(items.map((collection) => getCollectionAppCount(collection.slug)));

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Collections</h1>
      <ShelfGrid>
        {items.map((collection, index) => (
          <CollectionCard key={collection.slug} collection={collection} appCount={counts[index]} />
        ))}
      </ShelfGrid>
    </main>
  );
}
