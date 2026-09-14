import { getCategories, getCategoryAppCount } from "@/lib/catalog";
import ShelfGrid from "@/components/ShelfGrid";
import CategoryCard from "@/components/CategoryCard";
import styles from "./page.module.css";

/**
 * Category grid page — leaf 0.g.ii.zi (Search & Category Browse →
 * Category browse), the route the header nav's "Categories" link
 * (`Header.tsx`, `0.c.i.zi`) has pointed `/categories` at as a forward
 * reference since Phase 0's very first UI leaves.
 *
 * This leaf also creates `/categories/[slug]` (the per-category apps
 * listing each `CategoryCard` links to) — the same incremental pattern
 * `0.e.i.zi` followed for the app detail page: a leaf that introduces
 * a browsing surface builds both the index and the page it has to link
 * somewhere real, rather than linking to a route that doesn't exist
 * yet. `0.g.ii.zo` (advanced filters) extends the per-category page
 * next; it doesn't touch this index.
 *
 * Counts are fetched once here via `getCategoryAppCount` per category
 * (small, fixed category list — three today) and passed down to each
 * `CategoryCard` rather than each card fetching its own.
 */
export default async function CategoriesPage() {
  const categories = await getCategories();
  const counts = await Promise.all(categories.map((category) => getCategoryAppCount(category.slug)));

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Categories</h1>
      <ShelfGrid>
        {categories.map((category, index) => (
          <CategoryCard key={category.slug} category={category} appCount={counts[index]} />
        ))}
      </ShelfGrid>
    </main>
  );
}
