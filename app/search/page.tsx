import { CatalogUnavailableError, searchApps, logSearchQuery, getSearchPage, type SearchPage as SearchPageData } from "@/lib/catalog";
import ShelfGrid from "@/components/ShelfGrid";
import AppCard from "@/components/AppCard";
import EmptyState from "@/components/EmptyState";
import Pager from "@/components/Pager";
import CatalogUnavailable from "@/components/CatalogUnavailable";
import styles from "./page.module.css";

/**
 * Search results page — leaf 0.g.i.zo (Search & Category Browse →
 * Search), the route the header's search form (`components/SearchBar`,
 * 0.g.i.zi) has pointed `action="/search"` at as a forward reference
 * since 0.c.i.zi. This is the no-JS landing page: pressing Enter in
 * the search bar, or following any other link to `/search?q=...`,
 * always works even without the instant-suggestions dropdown.
 *
 * Deliberately reuses `ShelfGrid`/`AppCard` directly rather than
 * `Shelf` (0.d.ii.zi) — `Shelf` renders nothing at all on an empty
 * `apps` array, which is right for a home-page shelf that should just
 * not appear, but wrong here: a search with zero matches needs to say
 * so, not silently show an empty page. Query is read from
 * `searchParams` (a plain server-rendered page, not a client
 * component) and passed straight to the existing `searchApps` — no
 * new data-fetching logic, this leaf is the page around it.
 *
 * The "no query yet" and "zero matches" messages now render through
 * `EmptyState` (3.a.iii.zo) instead of a bare `<p>` — same component
 * `/categories/[slug]` uses for its own empty case, below.
 *
 * Also the call site for `logSearchQuery` (`3.c.ii.zo`) — see that
 * function's own comment in `lib/catalog.ts` for why this page load,
 * specifically, is where a search gets logged rather than inside
 * `searchApps` itself.
 *
 * Paged in table mode — leaf `5.l.v.zo`. With the Supabase env set the results are read one page at
 * a time (`getSearchPage`, 24 a page): page 1 is the matching first-party apps and then the first
 * third-party matches in `top` order; later pages are third-party only, reached by the "Next page"
 * link (`?q=<query>&after=<cursor>`). The catalog is read by keyset, so there are no page numbers
 * and no total, and going back is the browser's back button. **Only the first page is logged as a
 * search** (`logSearchQuery`): a "Next page" click is the same search, and logging it again would
 * inflate the top-searches dashboard.
 *
 * When the catalog cannot be read — leaf `5.l.xxi.zo`. `getSearchPage` throws `CatalogUnavailableError`
 * (an unusable Supabase env counts) and this page catches only that error: it shows the first-party
 * matches (`searchApps`, first-party only) above the shared "temporarily unavailable" notice, with no
 * pager, and logs the query once, as the whole-result page did. A search with no first-party match
 * shows the notice alone, not "No results" (an outage says nothing about the query). The
 * `page === null` whole-result branch is gone. Any other error is not caught and reaches
 * `app/error.tsx`. HTTP status: `app/search/loading.tsx` makes Next stream before the read is known,
 * so the response is `200` and the notice marks the list as partial; a `503` cannot be set from here.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; after?: string | string[] }>;
}) {
  const { q, after } = await searchParams;
  const query = (q ?? "").trim();
  let page: SearchPageData | null = null;
  let unavailable = false;
  if (query) {
    try {
      page = await getSearchPage(query, after);
    } catch (error) {
      if (!(error instanceof CatalogUnavailableError)) throw error;
      unavailable = true;
    }
  }
  // Log the first page only; on an outage there is no page, so the load is logged once, as before.
  if (query && (unavailable || page?.isFirstPage)) {
    await logSearchQuery(query);
  }
  const results = query ? (page ? page.apps : unavailable ? await searchApps(query) : []) : [];

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>
        {query ? (
          <>
            Search results for &ldquo;{query}&rdquo;
          </>
        ) : (
          "Search"
        )}
      </h1>

      {!query && (
        <EmptyState
          kind="search"
          heading="Search for an app"
          message="Type something in the search bar above to get started."
        />
      )}

      {query && !unavailable && results.length === 0 && (
        <EmptyState
          kind="search"
          heading="No results"
          message={`No apps matched \u201c${query}\u201d.`}
        />
      )}

      {results.length > 0 && (
        <ShelfGrid>
          {results.map((app) => (
            <AppCard key={app.slug} app={app} />
          ))}
        </ShelfGrid>
      )}

      {unavailable && (
        <CatalogUnavailable
          heading="Search is temporarily limited"
          message="We could not search the whole catalog just now, so only some matches are shown. Please try again in a few minutes."
        />
      )}

      <Pager basePath="/search" nextCursor={page ? page.nextCursor : null} params={{ q: query }} />
    </main>
  );
}
