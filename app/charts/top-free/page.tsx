import { getTopFreeApps } from "@/lib/catalog";
import ShelfGrid from "@/components/ShelfGrid";
import AppCard from "@/components/AppCard";
import styles from "./page.module.css";

/**
 * Top Free chart page — leaf `3.b.iii.zi` (Metrics Pipeline, Charts).
 * §2/§4E name "Top Free" as its own dedicated chart, distinct from the
 * home page's Trending shelf (`view_count`-ranked, `0.d`/`3.b.ii.zo`)
 * and the New & Updated shelf (`updated_at`-ranked, `0.d`) — both of
 * which are short home-page previews, not standalone full-list pages.
 * This is the first standalone chart page; `3.b.iii.zo` (New & Updated
 * chart page) is the same shape, reading `getNewAndUpdated` instead.
 *
 * Reuses `ShelfGrid`/`AppCard` (same grid every other listing page —
 * search, categories — already uses, per §3's grid-density decision)
 * rather than a bespoke numbered-list layout; the numbering itself
 * comes from `AppCard`'s new optional `rank` prop, not a different
 * card. No `CategoryThemeScope` here — a cross-category chart has no
 * single category to scope to, unlike `/app/[slug]` or
 * `/categories/[slug]`.
 *
 * `getTopFreeApps` (`lib/catalog.ts`) returns the whole catalog
 * (there's no pagination leaf yet, and 15 apps doesn't need one) —
 * see that function's own doc comment for why "Top Free" here is
 * honestly just install-count order over the whole catalog rather
 * than a real free-vs-paid split this catalog has no concept of.
 */
export default async function TopFreeChartPage() {
  const apps = await getTopFreeApps();

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Top Free</h1>
      <p className={styles.subheading}>
        The most-installed apps on D-Store, ranked by total installs.
      </p>

      <ShelfGrid>
        {apps.map((app, index) => (
          <AppCard key={app.slug} app={app} rank={index + 1} />
        ))}
      </ShelfGrid>
    </main>
  );
}
