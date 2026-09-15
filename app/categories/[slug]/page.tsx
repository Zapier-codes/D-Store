import { notFound } from "next/navigation";
import { getCategoryBySlug, getApps } from "@/lib/catalog";
import { getTheme } from "@/lib/theme";
import CategoryThemeScope from "@/components/CategoryThemeScope";
import ShelfGrid from "@/components/ShelfGrid";
import AppCard from "@/components/AppCard";
import CategoryFilters from "@/components/CategoryFilters";
import EmptyState from "@/components/EmptyState";
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
 * Extended by `0.g.ii.zo` (advanced filters — license, size): reads
 * `license`/`maxSize` from `searchParams` and passes them straight to
 * `getApps` (lib/catalog.ts), which grew matching `license`/`maxSizeMb`
 * options for this leaf. The category's *unfiltered* app list is
 * fetched separately (`allApps`) purely to derive which licenses are
 * actually present — see `CategoryFilters`'s header comment for why
 * that can't just be every license in the whole catalog.
 *
 * The two empty-result messages now render through `EmptyState`
 * (3.a.iii.zo) instead of a bare `<p>`, distinguishing "no apps in this
 * category at all" from "filters excluded everything" — the search
 * page above uses the same component for its own, differently-worded
 * empty case.
 *
 * `<main>` is now wrapped in `CategoryThemeScope` (`0.i.ii.zo`),
 * `categorySlug={slug}` directly — this page already *is* one
 * category's context, unlike the app detail page which has to reach
 * for `app.category`. Re-skins when `slug` has a register
 * (`lib/category-theme.ts`), does nothing otherwise.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ license?: string; maxSize?: string }>;
}) {
  const { slug } = await params;
  const { license = "", maxSize = "" } = await searchParams;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  const allApps = await getApps({ category: slug });
  const licenses = [...new Set(allApps.map((app) => app.license))].sort();

  const apps = await getApps({
    category: slug,
    license: license || undefined,
    maxSizeMb: maxSize ? Number(maxSize) : undefined,
  });
  const mode = await getTheme();

  return (
    <CategoryThemeScope categorySlug={slug} mode={mode}>
      <main className={styles.main}>
        <h1 className={styles.heading}>{category.name}</h1>

        {allApps.length > 0 && (
          <CategoryFilters
            categorySlug={slug}
            licenses={licenses}
            selectedLicense={license}
            selectedMaxSize={maxSize}
          />
        )}

        {apps.length === 0 ? (
          <EmptyState
            kind="filter"
            heading={allApps.length === 0 ? "No apps yet" : "No matches"}
            message={
              allApps.length === 0
                ? "No apps in this category yet."
                : "No apps in this category match the selected filters."
            }
          />
        ) : (
          <ShelfGrid>
            {apps.map((app) => (
              <AppCard key={app.slug} app={app} />
            ))}
          </ShelfGrid>
        )}
      </main>
    </CategoryThemeScope>
  );
}
