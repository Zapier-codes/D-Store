import { searchApps, logSearchQuery } from "@/lib/catalog";
import ShelfGrid from "@/components/ShelfGrid";
import AppCard from "@/components/AppCard";
import EmptyState from "@/components/EmptyState";
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
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  if (query) {
    await logSearchQuery(query);
  }
  const results = query ? await searchApps(query) : [];

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
    </main>
  );
}
