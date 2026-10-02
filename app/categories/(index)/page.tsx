import { getTaxonomyCategories, getTaxonomyAppCount } from "@/lib/catalog";
import Link from "next/link";
import ShelfGrid from "@/components/ShelfGrid";
import CategoryCard from "@/components/CategoryCard";
import styles from "./page.module.css";

/**
 * Category grid page — leaf 0.g.ii.zi (Search & Category Browse →
 * Category browse), the route the header nav's "Categories" link
 * (`Header.tsx`, `0.c.i.zi`) has pointed `/categories` at as a forward
 * reference since Phase 0's very first UI leaves.
 *
 * **Moved onto the two-axis taxonomy by `5.i.iv.zi`.** It used to list the
 * 12 hand-written legacy categories; it now lists the Play-model vocabulary
 * (`lib/taxonomy.ts`) in two sections, Apps (32 categories) and Games (17
 * genres), each card linking to `/categories/<appType>/<slug>`. Counts come
 * from `getTaxonomyAppCount`, which translates each app's stored category
 * through the read-time shim, so an app still carrying a legacy slug is
 * counted under its Play equivalent. Empty categories are listed too (as
 * the 12 always were, zero apps included) — the count says "0 apps". The
 * old `/categories/<legacy-slug>` pages still exist and are not linked from
 * here; `5.i.iv.zo` turns them into redirects.
 *
 * Counts are fetched once here (49 in parallel) and passed down to each
 * `CategoryCard` rather than each card fetching its own.
 *
 * Leaf `5.l.xi.zo`: a "Browse all apps" link under the heading to `/apps`, the paged list of every
 * app and game, so the categories index also leads to the whole catalog, not only to its shelves.
 */
export default async function CategoriesPage() {
  const all = await getTaxonomyCategories();
  const counts = await Promise.all(all.map((category) => getTaxonomyAppCount(category.app_type, category.slug)));
  const entries = all.map((category, index) => ({ category, count: counts[index] }));
  const sections = [
    { appType: "app" as const, heading: "Apps", noun: "app" },
    { appType: "game" as const, heading: "Games", noun: "game" },
  ];

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Categories</h1>
      <p className={styles.allApps}>
        <Link href="/apps">Browse all apps</Link>
      </p>
      {sections.map((section) => (
        <section key={section.appType} className={styles.section} aria-labelledby={`categories-${section.appType}`}>
          <h2 id={`categories-${section.appType}`} className={styles.sectionHeading}>
            {section.heading}
          </h2>
          <ShelfGrid>
            {entries
              .filter((entry) => entry.category.app_type === section.appType)
              .map(({ category, count }) => (
                <CategoryCard
                  key={`${category.app_type}:${category.slug}`}
                  category={category}
                  appCount={count}
                  href={`/categories/${category.app_type}/${category.slug}`}
                  noun={section.noun}
                />
              ))}
          </ShelfGrid>
        </section>
      ))}
    </main>
  );
}
