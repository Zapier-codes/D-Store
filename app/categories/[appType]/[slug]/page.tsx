import { notFound } from "next/navigation";
import { getTaxonomyCategory, getApps } from "@/lib/catalog";
import { isAppType } from "@/lib/taxonomy";
import { themeSlugForTaxonomy } from "@/lib/category-theme";
import { getTheme } from "@/lib/theme";
import CategoryThemeScope from "@/components/CategoryThemeScope";
import ShelfGrid from "@/components/ShelfGrid";
import AppCard from "@/components/AppCard";
import CategoryFilters from "@/components/CategoryFilters";
import EmptyState from "@/components/EmptyState";
import styles from "./page.module.css";

/**
 * Per-category apps listing on the two-axis taxonomy — leaf `5.i.iv.zi`,
 * `/categories/[appType]/[slug]` (`/categories/app/tools`,
 * `/categories/game/puzzle`). It is the successor to `/categories/[slug]`
 * (`0.g.ii.zi`/`0.g.ii.zo`/`0.i.ii.zo`), which keeps working, unlinked,
 * until `5.i.iv.zo` redirects it here.
 *
 * **URL shape, decided here.** Two path segments, the `app_type` then the
 * category slug. Chosen over a game-slug prefix (`/categories/game-puzzle`)
 * because `sports` is both an app category and a game genre and a prefix
 * would need parsing, and over a query parameter because the category is the
 * page's identity, not a filter. A one-segment URL and a two-segment URL
 * cannot collide in the Next router, so the legacy pages coexist with these.
 *
 * `notFound()` on an `appType` other than `app`/`game`, and on a slug the
 * vocabulary does not contain for that type — which includes `uncategorized`
 * (unlisted; whether it gets a page is `5.i.iv.zo`'s to decide). Apps are
 * matched with `getApps({ taxonomy })`, the read-time shim, so an app still
 * carrying a legacy slug appears under its Play equivalent.
 *
 * Filters (`license`, `maxSize`) work exactly as on the legacy page, with
 * the "Clear filters" link pointing back here (`CategoryFilters`'s
 * `basePath`). The theme skin is looked up with `themeSlugForTaxonomy`, a
 * stopgap until `5.i.v.zi` re-keys the registry, so `finance` keeps "Vault"
 * and `books-and-reference` keeps "Sanctuary" (`reading` in the registry).
 */
export default async function TaxonomyCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ appType: string; slug: string }>;
  searchParams: Promise<{ license?: string; maxSize?: string }>;
}) {
  const { appType, slug } = await params;
  const { license = "", maxSize = "" } = await searchParams;

  if (!isAppType(appType)) {
    notFound();
  }
  const category = await getTaxonomyCategory(appType, slug);
  if (!category) {
    notFound();
  }

  const taxonomy = { appType, category: slug };
  const allApps = await getApps({ taxonomy });
  const licenses = [...new Set(allApps.map((app) => app.license))].sort();

  const apps = await getApps({
    taxonomy,
    license: license || undefined,
    maxSizeMb: maxSize ? Number(maxSize) : undefined,
  });
  const mode = await getTheme();

  return (
    <CategoryThemeScope categorySlug={themeSlugForTaxonomy(appType, slug)} mode={mode}>
      <main className={styles.main}>
        <h1 className={styles.heading}>{category.name}</h1>

        {allApps.length > 0 && (
          <CategoryFilters
            categorySlug={slug}
            basePath={`/categories/${appType}/${slug}`}
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
                ? `No ${appType === "game" ? "games" : "apps"} in this category yet.`
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
