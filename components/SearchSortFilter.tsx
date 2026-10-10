import Link from "next/link";
import { MIN_STARS_CHOICES, SEARCH_SORTS, isDefaultSearchView, type SearchSort } from "@/lib/search-view";
import styles from "./SearchSortFilter.module.css";

/**
 * Sort and filter controls for the search results — leaf port of Storeapp's `SearchSortFilterRow`
 * (`PlaySurfaces.kt`), operator-directed 2026-10-10 (Track k Play parity).
 *
 * A plain GET `<form>` submitting back to `/search`, the same no-JavaScript convention the header
 * search bar, `/search`'s own page and `CategoryFilters` (`0.g.ii.zo`) already use: changing the
 * sort or the rating filter reloads `/search?q=...&sort=...&minStars=...`, so the view is a real,
 * shareable URL and works with scripting off. The current query travels in a hidden field so a
 * re-sort never loses it.
 *
 * Only the portable half of Storeapp's row is offered. `installedOnly`/`hasApkOnly` are left out on
 * purpose — a web page cannot read the device — so this form is two controls (`sort`, `minStars`),
 * not four. See `lib/search-view.ts` for that decision in full.
 *
 * The "Clear filters" link is the way out of a non-default view: it drops `sort`/`minStars` but
 * keeps the query, so it returns to plain relevance ranking rather than to the empty search page.
 */
export default function SearchSortFilter({
  query,
  sort,
  minStars,
}: {
  query: string;
  sort: SearchSort;
  minStars: number;
}) {
  return (
    <form method="GET" action="/search" className={styles.form}>
      <input type="hidden" name="q" value={query} />

      <label className={styles.field}>
        <span className={styles.label}>Sort by</span>
        <select name="sort" defaultValue={sort} className={styles.select}>
          {SEARCH_SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Rating</span>
        <select name="minStars" defaultValue={String(minStars)} className={styles.select}>
          {MIN_STARS_CHOICES.map((choice) => (
            <option key={choice.value} value={String(choice.value)}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" className={styles.submit}>
        Apply
      </button>

      {!isDefaultSearchView(sort, minStars) && (
        <Link href={`/search?q=${encodeURIComponent(query)}`} className={styles.clear}>
          Clear filters
        </Link>
      )}
    </form>
  );
}
