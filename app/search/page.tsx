import { searchApps, logSearchQuery, getSearchPage } from "@/lib/catalog";
import ShelfGrid from "@/components/ShelfGrid";
import AppCard from "@/components/AppCard";
import EmptyState from "@/components/EmptyState";
import Pager from "@/components/Pager";
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
 * Paged in table mode — leaf `5.l.v.zo`. With `CATALOG_SOURCE=table` the results are read one page at
 * a time (`getSearchPage`, 24 a page): page 1 is the matching first-party apps and then the first
 * third-party matches in `top` order; later pages are third-party only, reached by the "Next page"
 * link (`?q=<query>&after=<cursor>`). The catalog is read by keyset, so there are no page numbers
 * and no total, and going back is the browser's back button. **Only the first page is logged as a
 * search** (`logSearchQuery`): a "Next page" click is the same search, and logging it again would
 * inflate the top-searches dashboard. With the table off, or when a page read fails, the page is
 * exactly the whole-result page it was: every match, no `after`, no pager, the query logged.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; after?: string | string[] }>;
}) {
  const { q, after } = await searchParams;
  const query = (q ?? "").trim();
  const page = query ? await getSearchPage(query, after) : null;
  // Table mode: log the first page only. Otherwise (as before): log every load of a non-blank query.
  if (query && (page === null || page.isFirstPage)) {
    await logSearchQuery(query);
  }
  const results = query ? (page ? page.apps : await searchApps(query)) : [];

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

      {query && results.length === 0 && (
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

      <Pager basePath="/search" nextCursor={page ? page.nextCursor : null} params={{ q: query }} />
    </main>
  );
}
