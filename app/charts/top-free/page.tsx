import { getTopFreeApps } from "@/lib/catalog";
import { isThirdParty, sourceName } from "@/lib/trust";
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
 *
 * Two ranked sections — leaf `5.h.viii.zo`. `getTopFreeApps` returns the
 * first-party group (ranked by D-Store installs) followed by the
 * third-party group (ranked by the source's reported downloads); the two
 * counters are never merged (see that function's doc comment for the
 * rule). This page splits the array with `isThirdParty` and restarts the
 * rank numbers in each section, so "1" in the second section is the top
 * third-party app, not a rank below every first-party one. The section
 * is omitted when it is empty.
 */
export default async function TopFreeChartPage() {
  const apps = await getTopFreeApps();
  const firstParty = apps.filter((app) => !isThirdParty(app));
  const thirdParty = apps.filter((app) => isThirdParty(app));
  const thirdPartySource = thirdParty[0] ? sourceName(thirdParty[0]) : "";

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Top Free</h1>
      <p className={styles.subheading}>
        The most-installed apps on D-Store, ranked by total installs.
      </p>

      <ShelfGrid>
        {firstParty.map((app, index) => (
          <AppCard key={app.slug} app={app} rank={index + 1} />
        ))}
      </ShelfGrid>

      {thirdParty.length > 0 && (
        <>
          <h2 className={styles.sectionHeading}>Third-party apps</h2>
          <p className={styles.subheading}>
            Ranked by downloads reported by {thirdPartySource}, not by D-Store installs, so these
            numbers are not comparable with the list above.
          </p>
          <ShelfGrid>
            {thirdParty.map((app, index) => (
              <AppCard key={app.slug} app={app} rank={index + 1} />
            ))}
          </ShelfGrid>
        </>
      )}
    </main>
  );
}
