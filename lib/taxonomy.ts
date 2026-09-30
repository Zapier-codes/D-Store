/**
 * D-Store taxonomy: shape and vocabulary — leaf `5.i.i.zi`.
 *
 * Local shape only. Nothing here reads the signed index, and nothing in this
 * file changes what any page shows: publishing `app_type`/`category` in the
 * index is `5.i.i.zo` (Zealot's), reading them tolerantly is `5.i.ii.zi`, and
 * moving the 12 legacy slugs and the UI onto this vocabulary was `5.i.ii.zo` (split; finished by `5.i.vii.zo`).
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

/** Longest raw category string kept in `App.category_raw`; anything longer is cut. */
export const CATEGORY_RAW_MAX = 100;

/** A point on the two-axis taxonomy: which list (`app_type`) and which entry (`category`). */
export interface TaxonomyPair {
  app_type: AppType;
  category: string;
}

/**
 * The 12 legacy F-Droid-inherited category slugs (`categories` in
 * `lib/mock-data.ts`) mapped onto the Play-model taxonomy — leaf `5.i.iii.zi`.
 *
 * Every entry is a judgement call and the operator may overrule any of them;
 * changing one is a one-line edit here and nothing else. Play's target names
 * are as remembered (see the module comment), not re-checked. Where a legacy
 * slug has no clean Play equivalent the nearest is chosen and flagged:
 *
 *  - `games` -> `game` / `uncategorized`. A legacy *category* that is really
 *    an `app_type`: it carries no genre, and inventing one (say `casual`)
 *    would claim something nobody knows. Zero apps carry it today (Minecraft
 *    404'd on Aptoide; see `lib/sources/aptoide.ts`), so this costs nothing.
 *  - `multimedia` -> `video-players-and-editors`. Play splits it with
 *    `music-and-audio`; the one ingested app (VLC) is a video player. A
 *    music app carrying `multimedia` would be filed under video.
 *  - `internet` -> `communication`. Play files browsers and messengers there
 *    (Firefox and WhatsApp are the two ingested apps). `internet` is also
 *    the *fallback* for every unmapped Aptoide package and every Zealot app
 *    without a category, so anything that landed there by default lands in
 *    `communication` too — that guess is `5.i.v.zo`'s to revisit.
 *  - `system` -> `tools` and `development` -> `tools`. Play has no system or
 *    developer category; `tools` is the nearest for both (Termux, GitHub).
 *  - `time` -> `productivity`. Calendars fit; alarm clocks (the one ingested
 *    app) are often listed under Tools on Play, so this one is weakest.
 *  - `writing` -> `productivity`. Note-taking (Obsidian) sits there on Play.
 *
 * The other five are direct: `navigation` -> `maps-and-navigation`,
 * `science-education` -> `education`, `theming` -> `personalization`,
 * `reading` -> `books-and-reference`, `finance` -> `finance`.
 *
 * Many-to-one is fine (`system`, `development` -> `tools`;
 * `time`, `writing` -> `productivity`); one-to-many is not possible in a
 * table, which is exactly why `multimedia` needed a pick.
 */
export const LEGACY_TO_PLAY: Readonly<Record<string, TaxonomyPair>> = {
  system: { app_type: "app", category: "tools" },
  multimedia: { app_type: "app", category: "video-players-and-editors" },
  games: { app_type: "game", category: UNCATEGORIZED.slug },
  internet: { app_type: "app", category: "communication" },
  navigation: { app_type: "app", category: "maps-and-navigation" },
  "science-education": { app_type: "app", category: "education" },
  theming: { app_type: "app", category: "personalization" },
  time: { app_type: "app", category: "productivity" },
  reading: { app_type: "app", category: "books-and-reference" },
  writing: { app_type: "app", category: "productivity" },
  development: { app_type: "app", category: "tools" },
  finance: { app_type: "app", category: "finance" },
};

/** The legacy slugs `LEGACY_TO_PLAY` covers, in table order. */
export const LEGACY_SLUGS: readonly string[] = Object.keys(LEGACY_TO_PLAY);

export type ToPlayVia = "vocabulary" | "legacy" | "unknown";

export interface ToPlayResult extends TaxonomyPair {
  /** How it was resolved: already Play vocabulary, translated from a legacy slug, or not recognized. */
  via: ToPlayVia;
}

/**
 * Translates any category string to a point on the two-axis taxonomy — leaf
 * `5.i.iii.zi`. The read-time shim `5.i.iii.zo` puts in front of the catalog
 * so an app carrying a legacy slug and one carrying a Play slug land on the
 * same page. Resolution order, first match wins:
 *
 *  1. **In the vocabulary** — for `appType` if given, else for either list
 *     (apps first, then games). Returned unchanged, `via: "vocabulary"`.
 *  2. **A legacy slug** (`LEGACY_TO_PLAY`) — returns its mapped pair,
 *     `via: "legacy"`. Ignores `appType`: a legacy app's `app_type` was itself
 *     derived from the slug (`games` was the only game).
 *  3. **Anything else** (unknown string, empty, non-string, a name like
 *     `constructor`) — `uncategorized`, `via: "unknown"`, keeping `appType`
 *     if given, else `"app"`.
 *
 * **Pass `appType` whenever you have it.** A bare slug is ambiguous on the
 * two axes (`sports` is in both lists): without `appType` it resolves to the
 * app category. Exact match, no trimming or case folding, like
 * `checkCategory`. Idempotent: feeding a result back in (with its own
 * `app_type`) returns the same pair. Never throws, never reads a name off the
 * prototype chain (producers control these strings).
 */
export function toPlay(category: unknown, appType?: AppType): ToPlayResult {
  const fallbackType: AppType = appType ?? "app";
  if (typeof category !== "string" || category.length === 0) {
    return { app_type: fallbackType, category: UNCATEGORIZED.slug, via: "unknown" };
  }

  const types: readonly AppType[] = appType ? [appType] : APP_TYPES;
  for (const type of types) {
    if (checkCategory(type, category).known) {
      return { app_type: type, category, via: "vocabulary" };
    }
  }

  if (Object.prototype.hasOwnProperty.call(LEGACY_TO_PLAY, category)) {
    const pair = LEGACY_TO_PLAY[category];
    return { app_type: pair.app_type, category: pair.category, via: "legacy" };
  }

  return { app_type: fallbackType, category: UNCATEGORIZED.slug, via: "unknown" };
}

/**
 * The category slug that "For You" affinity (`getCategoryAffinityApps`,
 * `lib/view-history.ts`) compares on — leaf `5.i.vi.zi`. A stored or legacy
 * slug goes through `toPlay`, so `internet` and `communication` count as the
 * same interest and a visitor's stored history keeps matching apps whether
 * a source emits the legacy slug or the Play one. `uncategorized` (which is
 * what an unknown, empty or non-string value becomes) returns `null`: "the
 * app has no category we know" is not an interest, and recommending every
 * uncategorized app to someone who opened one would be noise. Only the slug
 * is returned, not the app type: the one slug in both vocabularies is
 * `sports`, and a stored history entry carries no `app_type`, so for a
 * stored slug the type cannot be recovered (`toPlay` tries `app` first).
 * Pure; never throws.
 */
export function affinityCategory(category: unknown, appType?: AppType): string | null {
  const pair = toPlay(category, appType);
  return pair.category === UNCATEGORIZED.slug ? null : pair.category;
}

/**
 * A vocabulary entry on the two-axis model, with everything a browse page
 * needs — leaf `5.i.iii.zo`. `Category` in `lib/mock-data.ts` is the legacy
 * one-axis shape and stays until `5.i.v.zo`.
 */
export interface TaxonomyCategory extends TaxonomyEntry {
  app_type: AppType;
  /** Material Symbols name, as `Category.icon` is. Not rendered as a glyph yet (`AppIcon` draws an initial tile) — data for when it is. */
  icon: string;
}

/** Icon per vocabulary entry, keyed `"<app_type>:<slug>"`. Chosen by hand from the Material Symbols set; not verified to render. */
const TAXONOMY_ICONS: Readonly<Record<string, string>> = {
  "app:art-and-design": "palette",
  "app:auto-and-vehicles": "directions_car",
  "app:beauty": "face",
  "app:books-and-reference": "menu_book",
  "app:business": "business_center",
  "app:comics": "auto_stories",
  "app:communication": "chat",
  "app:dating": "favorite",
  "app:education": "school",
  "app:entertainment": "movie",
  "app:events": "event",
  "app:finance": "account_balance",
  "app:food-and-drink": "restaurant",
  "app:health-and-fitness": "fitness_center",
  "app:house-and-home": "home",
  "app:libraries-and-demo": "widgets",
  "app:lifestyle": "self_improvement",
  "app:maps-and-navigation": "navigation",
  "app:medical": "medical_services",
  "app:music-and-audio": "music_note",
  "app:news-and-magazines": "newspaper",
  "app:parenting": "child_care",
  "app:personalization": "brush",
  "app:photography": "photo_camera",
  "app:productivity": "task_alt",
  "app:shopping": "shopping_cart",
  "app:social": "group",
  "app:sports": "sports_soccer",
  "app:tools": "build",
  "app:travel-and-local": "flight",
  "app:video-players-and-editors": "video_library",
  "app:weather": "partly_cloudy_day",
  "game:action": "bolt",
  "game:adventure": "explore",
  "game:arcade": "sports_esports",
  "game:board": "grid_view",
  "game:card": "style",
  "game:casino": "casino",
  "game:casual": "toys",
  "game:educational": "school",
  "game:music": "music_note",
  "game:puzzle": "extension",
  "game:racing": "sports_motorsports",
  "game:role-playing": "shield",
  "game:simulation": "settings_suggest",
  "game:sports": "sports_soccer",
  "game:strategy": "psychology",
  "game:trivia": "quiz",
  "game:word": "spellcheck",
};

const FALLBACK_ICON = "category";

/**
 * Every vocabulary entry as a `TaxonomyCategory`: the 32 app categories, then
 * the 17 game genres, each list in vocabulary order. **`uncategorized` is not
 * listed** — it is what unknown values are shown as, not a shelf to browse
 * (`5.i.iv.zo` decides whether it gets a page). Fresh objects each call.
 */
export function listTaxonomyCategories(): TaxonomyCategory[] {
  return APP_TYPES.flatMap((appType) =>
    vocabularyFor(appType).map((entry) => ({
      app_type: appType,
      slug: entry.slug,
      name: entry.name,
      icon: TAXONOMY_ICONS[`${appType}:${entry.slug}`] ?? FALLBACK_ICON,
    })),
  );
}

/** One entry of `listTaxonomyCategories()`, or `null` (including for `uncategorized` and any unknown). Never throws. */
export function findTaxonomyCategory(appType: unknown, slug: unknown): TaxonomyCategory | null {
  if (!isAppType(appType) || typeof slug !== "string") return null;
  return listTaxonomyCategories().find((c) => c.app_type === appType && c.slug === slug) ?? null;
}

/**
 * Whether an app belongs to the category `(appType, slug)`, by its stored
 * pair. Every source now emits Play slugs and a real `app_type`
 * (`5.i.vi.zo`, `5.i.vii.zi`), so this is a direct comparison — the read-time
 * shim `5.i.iii.zo` put here (translating the stored slug through `toPlay`)
 * is gone (`5.i.vii.zo`). `("game", "uncategorized")` works like any other pair.
 */
export function appInTaxonomyCategory(
  app: { category: string; app_type: AppType },
  appType: AppType,
  slug: string,
): boolean {
  return app.app_type === appType && app.category === slug;
}
