import { searchApps } from "@/lib/catalog";
import ShelfGrid from "@/components/ShelfGrid";
import AppCard from "@/components/AppCard";
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
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
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

      {!query && <p className={styles.message}>Type something in the search bar above to get started.</p>}

      {query && results.length === 0 && (
        <p className={styles.message}>No apps matched &ldquo;{query}&rdquo;.</p>
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
