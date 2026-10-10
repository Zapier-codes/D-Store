import type { App } from "./mock-data";

/**
 * Search result sort — leaf port of Storeapp's `PlayModels.kt` (`SearchSort`/`applySearchView`),
 * operator-directed 2026-10-10 (Track k Play parity; the first "port" row in `docs/PLAY-PARITY.md`).
 *
 * A pure, dependency-free translation of the client's search view to this storefront. Storeapp's
 * `applySearchView` layers a sort and a set of catalogue filters on top of search results; two of
 * its three filters read the device, which a web page cannot do, so only the portable half is here:
 *
 *   - **sort** — Relevance (the catalogue's own order), Stars, Recently updated, Name, Size.
 *     Storeapp's SIZE sorts by `apkSize` (bytes); this client has no release asset to read a byte
 *     size from in the search path, but `App.size_mb` is the same quantity on the storefront, so
 *     Size sorts on it and the two stores reach the same order.
 *   - **minStars** — a catalogue facet (`PlayModels.kt`'s `filters.minStars`), mapped to this
 *     client's `avg_rating`.
 *
 * Deliberately absent, and why (recorded so the decision is not re-opened): `installedOnly` and
 * `hasApkOnly` are Storeapp's other two filters, and both need the device. A browser cannot read
 * what is installed on the phone, and the storefront never carries a row without a download door,
 * so neither filter has an honest meaning here. They are `n/a` on the web, exactly as
 * `docs/PLAY-PARITY.md` §1 already marks the device facets.
 *
 * Everything here is pure and importable by a test; the page (`app/search/page.tsx`) reads the two
 * URL values through `parseSearchSort`/`parseMinStars` and hands the list to `applySearchView`.
 */

/** The sort keys this storefront offers — Storeapp's `SearchSort`, same labels, in the same order. */
export type SearchSort = "relevance" | "stars" | "updated" | "name" | "size";

/** `SIZE_BUCKETS`-style fixed choices; the label is what a `<select>` shows, the value is the URL token. */
export const SEARCH_SORTS: { value: SearchSort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "stars", label: "Stars" },
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
];

/** The minimum-rating choices. 0 is "any"; the buckets mirror Play's rating filters. */
export const MIN_STARS_CHOICES: { value: number; label: string }[] = [
  { value: 0, label: "Any rating" },
  { value: 3, label: "3+ stars" },
  { value: 4, label: "4+ stars" },
  { value: 4.5, label: "4.5+ stars" },
];

/**
 * Card D-P7 — the content-rating (age) filter, Play's "parental controls / content filtering".
 * The `content_rating` string is free-form across sources ("Everyone", "Teen", "Mature 17+",
 * "Adults only 18+", ESRB/PEGI variants), so the filter keys on a normalized rating *class* rather
 * than an exact string. `ALL` is "any"; the four classes are ordered mildest to strongest, and a
 * "limit" filter keeps everything at or below the chosen class. An app whose source gave no rating
 * (or a class we cannot place) is treated as unrated and only appears under "Any" — never guessed
 * into a class, the same rule every other derivation here follows.
 */
export type ContentClass = "everyone" | "teen" | "mature" | "adults";

export const CONTENT_CLASS_ORDER: ContentClass[] = ["everyone", "teen", "mature", "adults"];

/** The filter choices; `any` is the default and the only one that shows an unrated app. */
export const AGE_FILTER_CHOICES: { value: "any" | ContentClass; label: string }[] = [
  { value: "any", label: "All ages" },
  { value: "everyone", label: "Everyone" },
  { value: "teen", label: "Teen" },
  { value: "mature", label: "Mature" },
  { value: "adults", label: "Adults only" },
];

/** Place a free-form content-rating string into a class, or `null` when it cannot be placed. */
export function contentClass(rating: string | null | undefined): ContentClass | null {
  if (typeof rating !== "string") return null;
  const text = rating.toLowerCase();
  if (text.length === 0) return null;
  if (/adult|18\+|porn|only 18/.test(text)) return "adults";
  if (/mature|17\+|\bm\b|esrb.*m/.test(text)) return "mature";
  if (/teen|12\+|13\+|16\+|esrb.*t/.test(text)) return "teen";
  if (/everyone|all ages|3\+|\be\b|esrb.*e|general/.test(text)) return "everyone";
  return null;
}

/** The raw age-filter token from a URL, defaulting to "any" for anything unknown. */
export function parseAgeFilter(value: unknown): "any" | ContentClass {
  if (typeof value !== "string") return "any";
  const token = value.trim().toLowerCase();
  return AGE_FILTER_CHOICES.some((c) => c.value === token) ? (token as "any" | ContentClass) : "any";
}

/**
 * Filter apps by the age class: `any` keeps all, a class keeps the app only when its own class is
 * at or below the chosen one (mildest-first) — so "Teen" shows Everyone and Teen apps, and an
 * unrated app is dropped by any real class rather than shown or guessed.
 */
export function applyAgeFilter<T extends { content_rating: string; not_provided?: string[] }>(
  apps: readonly T[],
  filter: "any" | ContentClass,
): T[] {
  if (filter === "any") return [...apps];
  const ceiling = CONTENT_CLASS_ORDER.indexOf(filter);
  return apps.filter((app) => {
    if (app.not_provided?.includes("content_rating")) return false;
    const cls = contentClass(app.content_rating);
    return cls !== null && CONTENT_CLASS_ORDER.indexOf(cls) <= ceiling;
  });
}

/**
 * The raw sort token from a URL to a known key, defaulting to Relevance for anything else (a
 * missing or foreign value is "the default view", never an error — same posture `parseAfter` takes
 * for the pager cursor). Case-insensitive so a hand-typed `?sort=Stars` still lands.
 */
export function parseSearchSort(value: unknown): SearchSort {
  if (typeof value !== "string") return "relevance";
  const token = value.trim().toLowerCase();
  return SEARCH_SORTS.some((s) => s.value === token) ? (token as SearchSort) : "relevance";
}

/**
 * The raw minimum-rating token from a URL to a known bucket, defaulting to 0 (any). Only the offered
 * buckets are accepted, so `?minStars=3.7` is "any" rather than a silent third filter that could
 * never match its own option in the `<select>`.
 */
export function parseMinStars(value: unknown): number {
  if (typeof value !== "string") return 0;
  const parsed = Number(value);
  return MIN_STARS_CHOICES.some((c) => c.value === parsed) ? parsed : 0;
}

/**
 * True when the view is the default (Relevance, any rating, any age, any language) — the page then
 * adds no notice or clear link. Card D-P8 adds the `language` term; it defaults to `"any"` so every
 * existing caller is unchanged.
 */
export function isDefaultSearchView(
  sort: SearchSort,
  minStars: number,
  age: "any" | ContentClass = "any",
  language: string = "any",
): boolean {
  return sort === "relevance" && minStars === 0 && age === "any" && language === "any";
}

/**
 * The search results after Storeapp's view is applied — the portable half of `applySearchView`.
 *
 * A stable sort, so Relevance keeps the catalogue's own order (first-party leading, then the
 * third-party order) and a tie under any other key keeps the order the catalogue produced, which
 * is the same "leave ties to the input order" behaviour `applySearchView` relies on. The list is not
 * mutated (a new array is returned), so the caller's own list is untouched.
 */
export function applySearchView(
  apps: readonly App[],
  sort: SearchSort,
  minStars: number
): App[] {
  const filtered = minStars > 0 ? apps.filter((app) => app.avg_rating >= minStars) : [...apps];
  switch (sort) {
    case "stars":
      return filtered.sort((a, b) => b.avg_rating - a.avg_rating);
    case "updated":
      return filtered.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    case "name":
      return filtered.sort((a, b) => a.name.localeCompare(b.name));
    case "size":
      return filtered.sort((a, b) => b.size_mb - a.size_mb);
    case "relevance":
      return filtered;
  }
}

/** The query string for a search view (sort + rating + query), used by the form and the pager. */
export function searchViewQuery(
  query: string,
  sort: SearchSort,
  minStars: number,
  age: "any" | ContentClass = "any",
  language: string = "any",
): Record<string, string> {
  const params: Record<string, string> = {};
  if (query) params.q = query;
  if (sort !== "relevance") params.sort = sort;
  if (minStars > 0) params.minStars = String(minStars);
  if (age !== "any") params.age = age;
  if (language !== "any") params.language = language;
  return params;
}
