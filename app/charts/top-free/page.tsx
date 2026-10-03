import { CatalogUnavailableError, getTopFreeApps, getTopFreePage, type App, type TopFreePage } from "@/lib/catalog";
import { parseRankOffset } from "@/lib/apps-page";
import { isThirdParty, sourceName } from "@/lib/trust";
import ShelfGrid from "@/components/ShelfGrid";
import AppCard from "@/components/AppCard";
import Pager from "@/components/Pager";
import CatalogUnavailable from "@/components/CatalogUnavailable";
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
 * `getTopFreeApps` (`lib/catalog.ts`) returns the whole catalog when the
 * table is off — see that function's own doc comment for why "Top Free"
 * here is honestly just install-count order over the whole catalog
 * rather than a real free-vs-paid split this catalog has no concept of.
 *
 * Two ranked sections — leaf `5.h.viii.zo`. `getTopFreeApps` returns the
 * first-party group (ranked by D-Store installs) followed by the
 * third-party group (ranked by the source's reported downloads); the two
 * counters are never merged (see that function's doc comment for the
 * rule). This page splits the array with `isThirdParty` and restarts the
 * rank numbers in each section, so "1" in the second section is the top
 * third-party app, not a rank below every first-party one. The section
 * is omitted when it is empty.
 *
 * Paged in table mode — leaf `5.l.x.zo`. With the Supabase env set
 * the chart is read one page at a time (`getTopFreePage`, 24 a page):
 * page 1 is the first-party section and the first third-party rows;
 * later pages are third-party only, reached by the "Next page" link
 * (`?after=<cursor>`). The catalog is read by keyset, so there are no
 * page numbers and no total, and going back is the browser's back
 * button. Third-party ranks carry on across pages through `?n=<rows so
 * far>`, which is DISPLAY ONLY (`parseRankOffset`; never used to read
 * data, and ignored on page 1), so page 2 starts at 25, not 1.
 *
 * When the catalog cannot be read — leaf `5.l.xx.zo`. `getTopFreePage`
 * throws `CatalogUnavailableError` (an unusable Supabase env counts) and
 * this page catches only that error: it shows the first-party apps
 * (`getTopFreeApps()` is first-party only now) under the same heading,
 * then the shared "temporarily unavailable" notice, with no third-party
 * section and no pager. The whole-list fallback is gone. Any other error
 * is not caught and reaches `app/error.tsx`. HTTP status: this route sits
 * under the root `app/loading.tsx`, so streaming sends `200` before the
 * read is known; the notice is what tells a visitor (and a crawler that
 * reads the body) the list is partial. A `503` cannot be set from here
 * once the response has started, so none is claimed.
 */
export default async function TopFreeChartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  let page: TopFreePage | null = null;
  try {
    page = await getTopFreePage(query.after);
  } catch (error) {
    if (!(error instanceof CatalogUnavailableError)) throw error;
  }

  let firstParty: App[];
  let thirdParty: App[] = [];
  let thirdPartyOffset = 0;
  let nextCursor: string | null = null;

  if (page) {
    firstParty = page.firstParty;
    thirdParty = page.thirdParty;
    thirdPartyOffset = parseRankOffset(query.n, page.isFirstPage);
    nextCursor = page.nextCursor;
  } else {
    // Outage: the first-party apps alone, no third-party section, no pager (nextCursor stays null).
    const apps = await getTopFreeApps();
    firstParty = apps.filter((app) => !isThirdParty(app));
  }
  const thirdPartySource = thirdParty[0] ? sourceName(thirdParty[0]) : "";

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Top Free</h1>
      <p className={styles.subheading}>
        The most-installed apps on D-Store, ranked by total installs.
      </p>

      {(page !== null || firstParty.length > 0) && (
        <ShelfGrid>
          {firstParty.map((app, index) => (
            <AppCard key={app.slug} app={app} rank={index + 1} />
          ))}
        </ShelfGrid>
      )}

      {thirdParty.length > 0 && (
        <>
          <h2 className={styles.sectionHeading}>Third-party apps</h2>
          <p className={styles.subheading}>
            Ranked by downloads reported by {thirdPartySource}, not by D-Store installs, so these
            numbers are not comparable with the list above.
          </p>
          <ShelfGrid>
            {thirdParty.map((app, index) => (
              <AppCard key={app.slug} app={app} rank={thirdPartyOffset + index + 1} />
            ))}
          </ShelfGrid>
        </>
      )}

      {page === null && (
        <CatalogUnavailable
          heading="The rest of this list is temporarily unavailable"
          message="We could not load the full chart just now. Please try again in a few minutes."
        />
      )}

      <Pager
        basePath="/charts/top-free"
        nextCursor={nextCursor}
        params={{ n: String(thirdPartyOffset + thirdParty.length) }}
      />
    </main>
  );
}
