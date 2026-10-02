/**
 * Keyword categorizer for Aptoide apps — leaf `5.l.viii.zi`. PURE: no I/O, no env, nothing runs at import
 * beyond building two constant tables.
 *
 * Why: Aptoide's `app/get` response has no category field, so 1,494 of the 1,506 loaded apps were
 * `uncategorized` and the category rows and pages (`5.l.ix`, `5.l.v.zi`) would have nothing to show.
 * What the response does carry is `media.keywords`, a list of lower-case words that includes
 * Play-style category words (`tools`, `photography`, `music`, ...). This turns that list into one
 * `{ app_type, category }` on the two-axis taxonomy (`lib/taxonomy.ts`), or `null` for "no answer".
 * It is not wired into anything yet: `5.l.viii.zo` uses it in `normalizeAptoideApp` and re-derives the
 * rows already in `catalog_app` from their stored `raw`.
 *
 * Rules (recorded in HANDOVER.md, `5.l.iv.zo` split note and this leaf's Done note):
 * 1. Exact word match only. A keyword is trimmed, lower-cased and passed through `taxonomySlug`, then looked
 *    up in a fixed table. No guessing from an app's name or description, no substring match.
 * 2. Several matches never depend on the order Aptoide listed the words: the winner is the first match in
 *    `APP_PRIORITY` (specific categories before generic ones, `tools` last), so the same set of keywords
 *    gives the same answer in any order.
 * 3. A game needs a game signal. Unambiguous genre words (`puzzle`, `racing`, `strategy`, `simulation`,
 *    `adventure`, `arcade`, `casual`, `casino`, `trivia`, `rpg`) are one. Words that are also ordinary app
 *    words (`action`, `music`, `sports`, `educational`, `word`, `card`, `board`) count as a genre only when
 *    `game` or `games` is also present. `game` or `games` with no genre at all is `null`, never an app
 *    shelf: a game on the Entertainment shelf is a wrong shelf, and a wrong shelf is worse than none
 *    (`5.i.vi.zo`).
 * 4. No match is `null`; the caller keeps `uncategorized`.
 * 5. Input is untrusted: a non-array, non-string entries, empty strings and enormous lists never throw.
 *    At most `MAX_KEYWORDS` entries are read and each is cut at `MAX_KEYWORD_CHARS`.
 *
 * The package table `CATEGORY_BY_PACKAGE` (the operator's twelve hand-picked apps) still wins over this;
 * that precedence is applied by the caller (`5.l.viii.zo`), not here.
 */

import { taxonomySlug, type AppType, type TaxonomyPair } from "./taxonomy";

export const MAX_KEYWORDS = 200;
export const MAX_KEYWORD_CHARS = 100;

/** Keyword (as `taxonomySlug` writes it) to a Play app category slug. Only words Play itself uses. */
const APP_KEYWORDS: Readonly<Record<string, string>> = {
  art: "art-and-design",
  auto: "auto-and-vehicles",
  vehicles: "auto-and-vehicles",
  beauty: "beauty",
  books: "books-and-reference",
  reference: "books-and-reference",
  business: "business",
  comics: "comics",
  communication: "communication",
  dating: "dating",
  education: "education",
  entertainment: "entertainment",
  events: "events",
  finance: "finance",
  food: "food-and-drink",
  drink: "food-and-drink",
  health: "health-and-fitness",
  fitness: "health-and-fitness",
  "health-fitness": "health-and-fitness",
  lifestyle: "lifestyle",
  maps: "maps-and-navigation",
  navigation: "maps-and-navigation",
  medical: "medical",
  music: "music-and-audio",
  audio: "music-and-audio",
  news: "news-and-magazines",
  magazines: "news-and-magazines",
  parenting: "parenting",
  personalization: "personalization",
  photography: "photography",
  productivity: "productivity",
  shopping: "shopping",
  social: "social",
  sports: "sports",
  tools: "tools",
  travel: "travel-and-local",
  video: "video-players-and-editors",
  weather: "weather",
};

/**
 * Winner when several app categories match: first in this list. Specific before generic; `entertainment`,
 * `lifestyle` and `tools` are the catch-alls Aptoide puts on almost everything, so they come last.
 * Every category in `APP_KEYWORDS` must appear here exactly once (the test checks it).
 */
export const APP_PRIORITY: readonly string[] = [
  "medical",
  "parenting",
  "dating",
  "comics",
  "beauty",
  "weather",
  "maps-and-navigation",
  "food-and-drink",
  "finance",
  "books-and-reference",
  "news-and-magazines",
  "education",
  "health-and-fitness",
  "shopping",
  "travel-and-local",
  "auto-and-vehicles",
  "events",
  "art-and-design",
  "business",
  "music-and-audio",
  "video-players-and-editors",
  "photography",
  "communication",
  "social",
  "personalization",
  "sports",
  "productivity",
  "lifestyle",
  "entertainment",
  "tools",
];

/** Game words that mean a game on their own. Keyword to Play game genre slug. */
const GAME_KEYWORDS: Readonly<Record<string, string>> = {
  adventure: "adventure",
  arcade: "arcade",
  casino: "casino",
  casual: "casual",
  puzzle: "puzzle",
  racing: "racing",
  rpg: "role-playing",
  "role-playing": "role-playing",
  roleplaying: "role-playing",
  simulation: "simulation",
  strategy: "strategy",
  trivia: "trivia",
};

/** Game words that are also ordinary app words: a genre only when `game` or `games` is present too. */
const GAME_ONLY_WITH_SIGNAL: Readonly<Record<string, string>> = {
  action: "action",
  board: "board",
  card: "card",
  educational: "educational",
  music: "music",
  sports: "sports",
  word: "word",
};

/** Winner when several genres match: first in this list; `casual` is the generic one, so last. */
export const GAME_PRIORITY: readonly string[] = [
  "role-playing",
  "strategy",
  "racing",
  "puzzle",
  "simulation",
  "adventure",
  "action",
  "board",
  "card",
  "casino",
  "trivia",
  "word",
  "educational",
  "music",
  "sports",
  "arcade",
  "casual",
];

const GAME_SIGNALS: ReadonlySet<string> = new Set(["game", "games"]);

function firstInPriority(found: ReadonlySet<string>, priority: readonly string[]): string | null {
  for (const slug of priority) if (found.has(slug)) return slug;
  return null;
}

/**
 * The category for a list of Aptoide keywords, or `null`. Never throws. Same set of keywords, same answer,
 * whatever the order or repeats.
 */
export function categoryFromKeywords(keywords: unknown): TaxonomyPair | null {
  if (!Array.isArray(keywords)) return null;

  const appFound = new Set<string>();
  const gameFound = new Set<string>();
  const gameWeakFound = new Set<string>();
  let gameSignal = false;

  const limit = Math.min(keywords.length, MAX_KEYWORDS);
  for (let i = 0; i < limit; i += 1) {
    const raw: unknown = keywords[i];
    if (typeof raw !== "string") continue;
    const word = taxonomySlug(raw.slice(0, MAX_KEYWORD_CHARS));
    if (word === "") continue;

    if (GAME_SIGNALS.has(word)) gameSignal = true;
    if (Object.prototype.hasOwnProperty.call(GAME_KEYWORDS, word)) gameFound.add(GAME_KEYWORDS[word]);
    if (Object.prototype.hasOwnProperty.call(GAME_ONLY_WITH_SIGNAL, word)) gameWeakFound.add(GAME_ONLY_WITH_SIGNAL[word]);
    if (Object.prototype.hasOwnProperty.call(APP_KEYWORDS, word)) appFound.add(APP_KEYWORDS[word]);
  }

  const genres = new Set<string>(gameFound);
  if (gameSignal) for (const g of gameWeakFound) genres.add(g);

  // A game signal or an unambiguous genre word means "this is a game": answer with a genre or with nothing,
  // never with an app shelf.
  if (gameSignal || gameFound.size > 0) {
    const genre = firstInPriority(genres, GAME_PRIORITY);
    return genre === null ? null : { app_type: "game" as AppType, category: genre };
  }

  const category = firstInPriority(appFound, APP_PRIORITY);
  return category === null ? null : { app_type: "app" as AppType, category };
}
