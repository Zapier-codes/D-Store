import { notFound } from "next/navigation";
import { getTaxonomyCategory, getApps, getCategoryPage } from "@/lib/catalog";
import { UNCATEGORIZED, isAppType } from "@/lib/taxonomy";
import { getTheme } from "@/lib/theme";
import CategoryThemeScope from "@/components/CategoryThemeScope";
import ShelfGrid from "@/components/ShelfGrid";
import AppCard from "@/components/AppCard";
import type { App } from "@/lib/mock-data";
import CategoryFilters from "@/components/CategoryFilters";
import EmptyState from "@/components/EmptyState";
import Pager from "@/components/Pager";
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
 * vocabulary does not contain for that type — except `uncategorized`, which
 * `5.i.iv.zo` decided IS served (for both types) but stays unlisted: the
 * legacy `games` URL redirects to `/categories/game/uncategorized`. Apps are
 * matched with `getApps({ taxonomy })`, the read-time shim, so an app still
 * carrying a legacy slug appears under its Play equivalent.
 *
 * Filters (`license`, `maxSize`) work exactly as on the legacy page, with
 * the "Clear filters" link pointing back here (`CategoryFilters`'s
 * `basePath`). The theme skin is looked up by `(appType, slug)` directly
 * (`5.i.v.zi` re-keyed the registry), so `finance` keeps "Vault" and
 * `books-and-reference` keeps "Sanctuary".
 *
 * Paged in table mode — leaves `5.l.xii.zi` and `5.l.xii.zo`. With the Supabase env set the
 * category is read one page at a time (`getCategoryPage`, 24 a page, order `top`): page 1 is the
 * category's first-party apps and then the first third-party rows; later pages are third-party only,
 * reached by the "Next page" link (`?after=<cursor>`). The catalog is read by keyset, so there are no
 * page numbers and no total, and going back is the browser's back button. The license and size
 * filters work in table mode too (`5.l.xii.zo`): they go to the database function, the "Next page"
 * link keeps them (`license`, `maxSize`), and applying the form starts again from page 1 because a
 * GET form drops `after`. The license list is the category's own, read from the table. If that list
 * cannot be read (the `5.l.xii.zo` migration not applied, or the read failed) the filters are hidden
 * and the page is paged and unfiltered. With the table off, or when the page read fails, the page is
 * exactly the whole-category page it was, filters included, with no `after` and no pager.
 */
export default async function TaxonomyCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ appType: string; slug: string }>;
  searchParams: Promise<{ license?: string; maxSize?: string; after?: string | string[] }>;
}) {
  const { appType, slug } = await params;
  const { license = "", maxSize = "", after } = await searchParams;

  if (!isAppType(appType)) {
    notFound();
  }
  // `uncategorized` is the one slug that is served but not in the vocabulary
  // (unlisted on /categories and in the sitemap): the read-time shim files
  // there every legacy `games` app and every app whose category was not
  // recognized, and the legacy `games` URL redirects to
  // `/categories/game/uncategorized`, so it has to resolve (`5.i.iv.zo`).
  const category =
    slug === UNCATEGORIZED.slug ? { name: UNCATEGORIZED.name } : await getTaxonomyCategory(appType, slug);
  if (!category) {
    notFound();
  }

  const taxonomy = { appType, category: slug };
  const page = await getCategoryPage(appType, slug, {
    after,
    license: license || undefined,
    maxSizeMb: maxSize ? Number(maxSize) : undefined,
  });

  // Table mode: one page, filters applied by the database. Otherwise: the whole category, as before.
  let apps: App[];
  let licenses: string[];
  let showFilters: boolean;
  let emptyAtAll: boolean;
  if (page) {
    apps = page.apps;
    licenses = page.licenses ?? [];
    showFilters = page.licenses !== null;
    emptyAtAll = apps.length === 0 && page.license === undefined && page.maxSizeMb === undefined;
  } else {
    const allApps = await getApps({ taxonomy });
    licenses = [...new Set(allApps.map((app) => app.license))].sort();
    apps = await getApps({
      taxonomy,
      license: license || undefined,
      maxSizeMb: maxSize ? Number(maxSize) : undefined,
    });
    showFilters = allApps.length > 0;
    emptyAtAll = allApps.length === 0;
  }
  const mode = await getTheme();

  return (
    <CategoryThemeScope appType={appType} category={slug} mode={mode}>
      <main className={styles.main}>
        <h1 className={styles.heading}>{category.name}</h1>

        {showFilters && (
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
            heading={emptyAtAll ? "No apps yet" : "No matches"}
            message={
              emptyAtAll
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

        <Pager
          basePath={`/categories/${appType}/${slug}`}
          nextCursor={page ? page.nextCursor : null}
          params={{
            license: page?.license,
            maxSize: page?.maxSizeMb !== undefined ? String(page.maxSizeMb) : undefined,
          }}
        />
      </main>
    </CategoryThemeScope>
  );
}
