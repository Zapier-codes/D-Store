import { notFound } from "next/navigation";
import { getCategoryBySlug, getApps } from "@/lib/catalog";
import ShelfGrid from "@/components/ShelfGrid";
import AppCard from "@/components/AppCard";
import styles from "./page.module.css";

/**
 * Per-category apps listing — leaf 0.g.ii.zi, created alongside the
 * `/categories` index (see that page's header comment for why both
 * land in one leaf). `notFound()` on an unknown slug, same convention
 * as `/app/[slug]` (0.e.i.zi).
 *
 * Reuses `ShelfGrid`/`AppCard` directly rather than `Shelf` (0.d.ii.zi)
 * — same reasoning as the search results page (`0.g.i.zo`): `Shelf`
 * silently renders nothing on an empty `apps` array, which is wrong
 * here (an empty category should say so, not show a blank page).
 *
 * `0.g.ii.zo` (advanced filters — license, size) extends this same
 * page next, the same incremental pattern already used across `0.d`
 * and the app detail page.
 */
export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  const apps = await getApps({ category: slug });

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>{category.name}</h1>

      {apps.length === 0 ? (
        <p className={styles.message}>No apps in this category yet.</p>
      ) : (
        <ShelfGrid>
          {apps.map((app) => (
            <AppCard key={app.slug} app={app} />
          ))}
        </ShelfGrid>
      )}
    </main>
  );
}
