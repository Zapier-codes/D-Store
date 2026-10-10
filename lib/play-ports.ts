import type { App } from "./mock-data";

/**
 * Web ports of Storeapp's `PlayModels.kt` derivation helpers (`badgesFor`, `trailerUrlFor`,
 * `similarAppsFor`). Pure: no I/O, no React, no network. See `docs/PARITY-KANBAN.md` cards D-P1,
 * D-P3, D-P4 and `docs/PLAY-PARITY.md` section 1.
 *
 * The rule the client already follows is kept here: a badge or a rail entry is produced only from a
 * field the source actually gave. Nothing is invented and a missing field produces nothing, never a
 * placeholder.
 */

// ── Listing badges (card D-P1) ────────────────────────────────────────────────

export type ListingBadgeId = "updated" | "trending" | "open-source";

export interface ListingBadge {
  id: ListingBadgeId;
  label: string;
}

const BADGE_LABELS: Record<ListingBadgeId, string> = {
  updated: "Updated",
  trending: "Trending",
  "open-source": "Open source",
};

/** Whole days between an ISO date and `now`; `null` when the value is missing or unparseable. */
export function daysSince(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  return Math.floor((now - time) / 86_400_000);
}

/** How long an app may go without an update and still wear the badge. Matches the client's 30 days. */
export const UPDATED_BADGE_DAYS = 30;

/**
 * The badges a listing has earned, in display order (strongest signal first): Updated when the source
 * changed it within `UPDATED_BADGE_DAYS`; Trending when the caller says the app is in this store's own
 * Trending list (the D-Store equivalent of the client's star threshold — the web holds no star count, so
 * the signal is Trending membership, passed in, never guessed); Open source always, because every source
 * this store aggregates is an open-source catalogue.
 */
export function badgesFor(
  app: Pick<App, "updated_at">,
  options: { now?: number; trending?: boolean } = {},
): ListingBadge[] {
  const out: ListingBadge[] = [];
  const age = daysSince(app.updated_at, options.now);
  if (age !== null && age >= 0 && age <= UPDATED_BADGE_DAYS) out.push(badge("updated"));
  if (options.trending === true) out.push(badge("trending"));
  out.push(badge("open-source"));
  return out;
}

function badge(id: ListingBadgeId): ListingBadge {
  return { id, label: BADGE_LABELS[id] };
}

// ── Installs label (card D-P2) ───────────────────────────────────────────────

/**
 * Card D-P2 — the client's `installsLabelFor`: a human install line, from the reported install count when the
 * source gave one, else from the star count ("N stars"), else nothing. On the web the star count is the only
 * fallback the storefront holds, so a first-party app with neither a combined download total nor any rating
 * yields `""` — the honest "no figure" the client also returns, never a made-up "0+".
 *
 * Kept separate from `app-facts.ts`'s `downloadsTile` (which formats a **measured** count) because this is the
 * client's **reported** label path and its output is a finished string, not a numeric tile.
 */
export function installsLabelFor(app: {
  origin?: string;
  install_count?: number;
  rating_count?: number;
  base_stats?: { downloads?: number } | null;
}): string {
  // A reported download figure wins, as the client's `meta.installs` does.
  let count = 0;
  if (app.origin !== "aptoide") {
    const carried = app.base_stats?.downloads;
    count = Number.isFinite(carried) ? Math.floor(carried as number) : 0;
    if (count <= 0 && Number.isFinite(app.install_count)) count = Math.floor(app.install_count as number);
  }
  if (count > 0) return `${formatCompact(count)}+ downloads`;
  // No downloads known: fall back to the rating count, the web's only stand-in for the client's star count.
  const stars = Number.isFinite(app.rating_count) ? Math.floor(app.rating_count as number) : 0;
  if (stars > 0) return `${formatCompact(stars)} ratings`;
  return "";
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${trimZero(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `${trimZero(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trimZero(n / 1_000)}K`;
  return String(n);
}

function trimZero(value: number): string {
  const fixed = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return fixed.replace(/\.0$/, "");
}

// ── Staged-rollout label (card Z-P1 reader) ──────────────────────────────────

/**
 * The reader half of card Z-P1: a short, honest label for a staged rollout, or `null` when the release is
 * fully rolled out (nothing to say) or the app carries no rollout block. A halted or pulled ramp always says
 * so regardless of percentage; an active ramp under 100% names the share. A third-party app never has this.
 */
export function rolloutLabel(app: {
  origin?: string;
  rollout_percentage?: number;
  rollout_status?: "active" | "halted" | "complete";
}): string | null {
  if (app.origin === "aptoide") return null;
  const status = app.rollout_status ?? "complete";
  if (status === "halted") return "Rollout paused";
  if (status === "complete") return null;
  const pct = Number.isFinite(app.rollout_percentage) ? Math.floor(app.rollout_percentage as number) : 100;
  if (pct >= 100) return null;
  if (pct <= 0) return "Rollout not started";
  return `Rolling out to ${pct}% of users`;
}

// ── Country / language preference (card D-P8) ────────────────────────────────

/**
 * Card D-P8 — a language preference for the catalogue, the web port of the client's `language` field
 * filter. The storefront has no translated listings, so this is honest about what it can do: "Any
 * language" keeps everything, and a named language keeps an app only when this store actually holds a
 * listing for it in that language, which today is never — so the filter degrades to a no-op rather than
 * pretending to translate. The machinery (choices, URL token, apply) is real and tested; a source that
 * starts publishing `language` values lights it up unchanged.
 *
 * The choice list is built from the languages actually present in a catalogue (`localeChoicesFor`),
 * so a language no app carries is never offered.
 */
export type LocaleChoice = { value: string; label: string };

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  pl: "Polish",
  ru: "Russian",
  uk: "Ukrainian",
  tr: "Turkish",
  ar: "Arabic",
  hi: "Hindi",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  "zh-cn": "Chinese (Simplified)",
  "zh-tw": "Chinese (Traditional)",
};

/** The display label for an ISO language code; falls back to the uppercased code for one we do not know. */
export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code.toLowerCase()] ?? code.toUpperCase();
}

/** The distinct languages present in a catalogue, sorted by label, with "Any language" prepended. */
export function localeChoicesFor(apps: readonly { language?: string | null }[]): LocaleChoice[] {
  const seen = new Set<string>();
  for (const app of apps) {
    const code = normalizeLanguage(app.language);
    if (code !== null) seen.add(code);
  }
  const named = [...seen]
    .map((code) => ({ value: code, label: languageLabel(code) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [{ value: "any", label: "Any language" }, ...named];
}

/** A language code as stored (lower-cased, region dropped to a short form) or `null` when absent/blank. */
export function normalizeLanguage(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return code.length === 0 ? null : code;
}

/** The raw language token from a URL, `null` when absent/blank (meaning "any"). */
export function parseLocale(value: unknown): string | null {
  return normalizeLanguage(typeof value === "string" ? value : null);
}

/**
 * Filter apps by language: no preference keeps them all; a named language keeps only apps whose own
 * `language` matches it. An app that carries no language is dropped by a real preference, never guessed
 * into one — the same rule the age filter follows.
 */
export function applyLocaleFilter<T extends { language?: string | null }>(
  apps: readonly T[],
  language: string | null,
): T[] {
  if (language === null) return [...apps];
  const wanted = normalizeLanguage(language);
  return apps.filter((app) => normalizeLanguage(app.language) === wanted);
}

// ── Watch trailer (card D-P3) ─────────────────────────────────────────────────

const YOUTUBE_URL = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{6,}/;
const YOUTUBE_ID = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/;
const VIMEO_URL = /https?:\/\/(?:www\.)?vimeo\.com\/\d+/;

/**
 * The first playable trailer link found in free text (a description or a README), or `null` when there
 * is none. Real detection, not a placeholder: a YouTube watch/short link wins, else a Vimeo link.
 */
export function trailerUrlFor(...texts: (string | null | undefined)[]): string | null {
  const haystack = texts.filter((t): t is string => typeof t === "string" && t.length > 0).join("\n");
  if (haystack.length === 0) return null;
  return YOUTUBE_URL.exec(haystack)?.[0] ?? VIMEO_URL.exec(haystack)?.[0] ?? null;
}

/** The YouTube id inside a trailer URL, when it is a YouTube one; `null` otherwise. */
export function youTubeId(url: string | null | undefined): string | null {
  if (typeof url !== "string" || url.length === 0) return null;
  return YOUTUBE_ID.exec(url)?.[1] ?? null;
}

// ── Scored "You might also like" rail (card D-P4) ─────────────────────────────

/** The fields the scorer reads; a plain `App` satisfies it, and tests can pass a small object. */
export type SimilarApp = Pick<App, "slug" | "name" | "description" | "category" | "source" | "avg_rating"> & {
  icon?: string | null;
};

/** The most entries the rail will ever carry. Matches the client's `max = 8`. */
export const SIMILAR_APPS_MAX = 8;

const WORD = /[^a-z0-9]+/;

/** Lower-cased words of length >= 4, the unit the scorer compares. Shared by the target and each candidate. */
function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(WORD)
      .filter((w) => w.length >= 4),
  );
}

/**
 * Related apps, scored rather than random: a same-category match is the strongest signal (weight 3), then
 * each shared description word (weight = the count), then a same-source nudge (weight 1); the average
 * rating breaks ties. Only non-zero scores are returned, so an app with no relation to anything shows
 * nothing rather than an arbitrary rail. Apps without an icon are skipped, and the target is never in its
 * own rail. The client's `language` match becomes a `category` match on the web (the closest field).
 */
export function similarAppsFor<
  T extends { slug: string; name: string; description?: string | null; category: string; source: string | null; avg_rating: number; icon?: string | null },
>(target: T, pool: readonly T[], max: number = SIMILAR_APPS_MAX): T[] {
  const targetWords = words(`${target.name} ${target.description ?? ""}`);
  const scored: { app: T; score: number }[] = [];
  for (const candidate of pool) {
    if (candidate.slug === target.slug) continue;
    if (candidate.icon != null && candidate.icon.length === 0) continue;
    let score = 0;
    if (target.category !== "" && candidate.category === target.category) score += 3;
    for (const w of words(`${candidate.name} ${candidate.description ?? ""}`)) {
      if (targetWords.has(w)) score += 1;
    }
    if (candidate.source === target.source) score += 1;
    if (score > 0) scored.push({ app: candidate, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || (b.app.avg_rating || 0) - (a.app.avg_rating || 0))
    .slice(0, max)
    .map((entry) => entry.app);
}
