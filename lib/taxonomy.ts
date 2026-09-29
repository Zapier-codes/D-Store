/**
 * D-Store taxonomy: shape and vocabulary — leaf `5.i.i.zi`.
 *
 * Local shape only. Nothing here reads the signed index, and nothing in this
 * file changes what any page shows: publishing `app_type`/`category` in the
 * index is `5.i.i.zo` (Zealot's), reading them tolerantly is `5.i.ii.zi`, and
 * moving the 12 current slugs and the UI onto this vocabulary is `5.i.ii.zo`.
 *
 * The model, in one paragraph. Every app has an `app_type` — a small closed
 * enum, `"app"` or `"game"` — and a `category`, an open string. The category
 * is *validated against* the vocabulary below, never *restricted by* it: a
 * category the vocabulary does not know is still a legal value (Zealot's
 * taxonomy manifest will be versioned separately and may run ahead of this
 * file), it is just reported as unknown so a caller can decide what to do.
 * `app_type` decides which list to check: `"app"` against the 32 app
 * categories, `"game"` against the 17 game genres.
 *
 * Slugs. Lower-case, `&` written as `and`, every other run of characters
 * outside `a-z0-9` collapsed to one `-` ("Art & Design" -> `art-and-design`,
 * "Role Playing" -> `role-playing`). The two lists overlap on purpose in
 * two places — `sports` is both an app category and a game genre,
 * `educational`/`education` and `music`/`music-and-audio` are near-misses —
 * so **a category slug is only unambiguous together with its `app_type`.**
 * Anything that counts or filters by category alone (`getCategoryAppCount`,
 * `getApps({ category })`) will merge the two `sports`; that is `5.i.ii.zo`'s
 * to resolve, not this leaf's.
 *
 * Where the vocabulary came from: Google Play's category and game-genre
 * lists as I remember them. **They were not re-checked against Play**, which
 * changes them from time to time; treat both lists as a seed. Nothing may
 * assume they are complete — that is exactly why `category` is open.
 *
 * Pure: no imports, no I/O, nothing runs at import, nothing throws.
 */

export type AppType = "app" | "game";

export const APP_TYPES: readonly AppType[] = ["app", "game"];

export interface TaxonomyEntry {
  slug: string;
  name: string;
}

/** Turns a display name into a taxonomy slug (see the module comment). */
export function taxonomySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function entries(names: readonly string[]): readonly TaxonomyEntry[] {
  return names.map((name) => ({ slug: taxonomySlug(name), name }));
}

/** Play's 32 app categories, in Play's alphabetical order. Not re-checked; see the module comment. */
export const PLAY_APP_CATEGORIES: readonly TaxonomyEntry[] = entries([
  "Art & Design",
  "Auto & Vehicles",
  "Beauty",
  "Books & Reference",
  "Business",
  "Comics",
  "Communication",
  "Dating",
  "Education",
  "Entertainment",
  "Events",
  "Finance",
  "Food & Drink",
  "Health & Fitness",
  "House & Home",
  "Libraries & Demo",
  "Lifestyle",
  "Maps & Navigation",
  "Medical",
  "Music & Audio",
  "News & Magazines",
  "Parenting",
  "Personalization",
  "Photography",
  "Productivity",
  "Shopping",
  "Social",
  "Sports",
  "Tools",
  "Travel & Local",
  "Video Players & Editors",
  "Weather",
]);

/** Play's 17 game genres, in Play's alphabetical order. Not re-checked; see the module comment. */
export const PLAY_GAME_GENRES: readonly TaxonomyEntry[] = entries([
  "Action",
  "Adventure",
  "Arcade",
  "Board",
  "Card",
  "Casino",
  "Casual",
  "Educational",
  "Music",
  "Puzzle",
  "Racing",
  "Role Playing",
  "Simulation",
  "Sports",
  "Strategy",
  "Trivia",
  "Word",
]);

/**
 * The fallback `5.i.ii.zi`'s tolerant reader shows for a category it does not
 * recognise. Deliberately **not** in either vocabulary: it is what an unknown
 * value is displayed as, not a category an app can be filed under, so
 * `checkCategory("app", UNCATEGORIZED.slug)` is `{ known: false }`.
 */
export const UNCATEGORIZED: TaxonomyEntry = { slug: "uncategorized", name: "Uncategorized" };

/** The vocabulary for one `app_type`. */
export function vocabularyFor(appType: AppType): readonly TaxonomyEntry[] {
  return appType === "game" ? PLAY_GAME_GENRES : PLAY_APP_CATEGORIES;
}

export function isAppType(value: unknown): value is AppType {
  return value === "app" || value === "game";
}

export type CategoryCheck =
  /** The slug is in the vocabulary for this `app_type`. */
  | { known: true; entry: TaxonomyEntry }
  /** Not in the vocabulary. Still a legal `category` — the vocabulary validates, it does not restrict. */
  | { known: false };

/**
 * Checks `category` against the vocabulary for `appType`. Compares the exact
 * slug (no trimming or case folding: a category that differs only in case is
 * a different string, and quietly matching it would hide a bad producer).
 * Never throws; a non-string or unknown `appType` is `{ known: false }`.
 */
export function checkCategory(appType: unknown, category: unknown): CategoryCheck {
  if (!isAppType(appType) || typeof category !== "string") return { known: false };
  const entry = vocabularyFor(appType).find((e) => e.slug === category);
  return entry ? { known: true, entry } : { known: false };
}

/**
 * The `app_type` for a category slug from the 12-slug F-Droid-inherited set
 * the catalog uses today (`lib/mock-data.ts`'s `categories`, and what
 * `lib/sources/aptoide.ts` maps into): `games` is a game, everything else an
 * app. This exists only so that the two source normalizers can fill the new
 * required `App.app_type` with something true until `5.i.ii.zi`/`5.i.ii.zo`
 * replace those slugs; it is not part of the target taxonomy and goes away
 * with them.
 */
export function appTypeForLegacyCategory(category: string): AppType {
  return category === "games" ? "game" : "app";
}

/** Longest raw category string kept in `App.category_raw`; anything longer is cut. */
export const CATEGORY_RAW_MAX = 100;

export interface ReadCategoryResult {
  /** What `App.category` is set to: the value if recognized, else `UNCATEGORIZED.slug`. */
  category: string;
  /** The producer's own value when it was present but not recognized (cut to `CATEGORY_RAW_MAX`), else `null`. */
  raw: string | null;
}

/**
 * The tolerant category reader — leaf `5.i.ii.zi`. Decides what a source
 * shows for the `category` value it was handed, without ever rejecting the
 * app or the index it came from.
 *
 * A value is **recognized** when it is a string that either (a) is in the
 * vocabulary for `appType` (`checkCategory`), or (b) is one of
 * `legacySlugs` — the 12 slugs the storefront's category pages, counts and
 * themes are built on today. (b) is a transition rule: until `5.i.ii.zo`
 * moves the UI to this vocabulary, reading a Play-vocabulary slug as
 * "known" is correct but the storefront has no page for it, while reading a
 * legacy slug as unknown would empty the existing category pages.
 *
 * Anything else — a string in neither list, an empty string, a number, an
 * object, `null`, `undefined` — is `UNCATEGORIZED`. When the value was a
 * non-empty string, it is kept in `raw` (cut to `CATEGORY_RAW_MAX`) so
 * nothing is lost if the vocabulary catches up; every other shape gives
 * `raw: null` because there is no string to keep.
 *
 * Exact match, no trimming or case folding, like `checkCategory`. Never
 * throws. Callers that want a *default* for an absent value (as
 * `lib/sources/zealot.ts` does) apply it before calling this.
 */
export function readCategory(
  raw: unknown,
  appType: AppType,
  legacySlugs: readonly string[],
): ReadCategoryResult {
  if (typeof raw !== "string" || raw.length === 0) {
    return { category: UNCATEGORIZED.slug, raw: null };
  }
  if (checkCategory(appType, raw).known || legacySlugs.includes(raw)) {
    return { category: raw, raw: null };
  }
  return { category: UNCATEGORIZED.slug, raw: raw.slice(0, CATEGORY_RAW_MAX) };
}
