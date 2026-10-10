import type { AnonymousReview, App, BaseStats, CarriedOverReview } from "./mock-data";
import { isThirdParty } from "./trust";

/**
 * Task 45b/45d — pure display helpers for an app's carried-over history (the
 * neutral `base_stats` and `reviews` Zealot publishes for an app that was
 * distributed by hand before it was listed; Zealot Tasks 45a/45c/45e).
 *
 * The rule for both, from the operator: show ONE number, Play-Store style, with
 * no "migrated" label anywhere in the UI — only the backend knows the history
 * was carried over. This store's own counters (`install_count`, `avg_rating`,
 * `rating_count`) are added to the carried-over base, never replacing it and
 * never double-counting it. Pure; nothing here reads a database or a network.
 */

/** The carried-over base stats for `app`, or `null` for a third-party app or one with none. */
export function baseStatsFor(app: Pick<App, "origin" | "base_stats">): BaseStats | null {
  if (isThirdParty(app)) return null;
  const stats = app.base_stats ?? null;
  if (stats === null) return null;
  const downloads = Number.isFinite(stats.downloads) && stats.downloads > 0 ? Math.floor(stats.downloads) : 0;
  const rating = stats.rating;
  const usableRating =
    rating !== null && Number.isFinite(rating.average) && Number.isFinite(rating.count) && rating.count > 0
      ? { average: rating.average, count: Math.floor(rating.count) }
      : null;
  if (downloads === 0 && usableRating === null) return null;
  return { downloads, rating: usableRating };
}

/**
 * The total downloads shown for an app that carries history: Zealot's `base_stats.downloads` ALONE.
 * That figure is already the whole count (the carried-over history plus the downloads GitHub counts for
 * the served file, Zealot Task 45e), and Zealot's own note on 45e says this store must NOT add its own
 * `install_count` on top: a click here is a download GitHub also counts, so adding both counts it twice.
 * `null` when the app has no carried-over base, so a caller keeps showing the store-native count alone
 * (never a fabricated zero base).
 */
export function combinedDownloadTotal(app: Pick<App, "origin" | "base_stats" | "install_count">): number | null {
  const base = baseStatsFor(app);
  if (base === null) return null;
  return base.downloads;
}

/**
 * The number a chart ranks by — Task 45b. The combined download total when the
 * app carries history (so an app with real carried-over downloads ranks by them,
 * not by this store's own near-zero counter), else this store's own
 * `install_count` as before. Never a fabricated base: an app with no carried-over
 * history ranks exactly as it always did.
 */
export function rankableDownloads(app: Pick<App, "origin" | "base_stats" | "install_count">): number {
  return combinedDownloadTotal(app) ?? app.install_count;
}

/**
 * The weighted average and count shown for an app: the carried-over rating
 * folded together with this store's own `avg_rating`/`rating_count` into one
 * number, so the two are never shown (or counted) twice. `null` when the app has
 * no carried-over base, so a caller keeps showing the store-native average alone.
 */
export function combinedRating(app: Pick<App, "origin" | "base_stats" | "avg_rating" | "rating_count">): {
  average: number;
  count: number;
} | null {
  const base = baseStatsFor(app);
  if (base === null) return null;
  const baseRating = base.rating;
  const ownCount = Number.isFinite(app.rating_count) && app.rating_count > 0 ? Math.floor(app.rating_count) : 0;
  const ownAverage = Number.isFinite(app.avg_rating) && app.avg_rating > 0 ? app.avg_rating : 0;
  const baseCount = baseRating?.count ?? 0;
  const baseAverage = baseRating?.average ?? 0;
  const count = baseCount + ownCount;
  if (count === 0) return { average: 0, count: 0 };
  const average = (baseAverage * baseCount + ownAverage * ownCount) / count;
  return { average: Math.round(average * 10) / 10, count };
}

/**
 * Play-Store-style short download number: `5789000` -> `"5.8M"`, `1500000` ->
 * `"1.5M"`, `999950` -> `"1M"` (rounds to one decimal, then promotes a `1000`
 * result to the next unit so it never shows `"1000K"`), `0` -> `"0"`. A
 * non-finite or negative input gives `"0"` and never throws. This is DISPLAY
 * only; the stored integer is unchanged.
 */
export function formatDownloadCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "0";
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (let i = 0; i < units.length; i++) {
    const [size, suffix] = units[i];
    if (count < size) continue;
    const value = Math.round((count / size) * 10) / 10;
    // A value that rounds up to 1000 has outgrown its unit (999,950 at K is
    // 1000.0): show it in the next larger unit instead of "1000K".
    if (value >= 1000 && i > 0) {
      const [largerSize, largerSuffix] = units[i - 1];
      return `${Math.round((count / largerSize) * 10) / 10}${largerSuffix}`;
    }
    return `${value}${suffix}`;
  }
  return `${Math.floor(count)}`;
}

/** The carried-over comments for `app`, oldest first; `[]` for a third-party app or one with none. */
export function carriedOverReviewsFor(app: Pick<App, "origin" | "carried_over_reviews">): CarriedOverReview[] {
  if (isThirdParty(app)) return [];
  return app.carried_over_reviews ?? [];
}

/** Z-P9 — the app's live anonymous reviews; `[]` for a third-party app or one with none. */
export function anonymousReviewsFor(app: Pick<App, "origin" | "anonymous_reviews">): AnonymousReview[] {
  if (isThirdParty(app)) return [];
  return app.anonymous_reviews ?? [];
}

/**
 * Task 45d — one review as the storefront shows it, whether it was carried over
 * from before the app was listed or written here. The two are merged into one
 * list with no label distinguishing them; only the backend knows the difference.
 */
export interface AppReview {
  id: string;
  author: string;
  rating: number;
  body: string | null;
  /** ISO date-time. */
  date: string;
  helpful_count: number;
  /** Card D-P6 — the developer's public reply, published by the reviews inbox (Z-P8); absent when none. */
  dev_reply?: string | null;
  /** Card Z-P8 — when the developer reply was written (ISO date-time); absent/none when there is no reply. */
  dev_replied_at?: string | null;
  /** Z-P9 — the earned "verified install" mark, so the list can badge the review. Absent/false when not earned. */
  verified_install?: boolean;
}

/**
 * Merge carried-over comments with this store's own live reviews into one list,
 * newest first (ties broken by id, so the order is deterministic). A live review
 * today is an anonymous 1-5 star submission (`Review` in `lib/mock-data.ts`, no
 * author or text), so it renders as a visitor's star rating; a carried-over
 * comment keeps its author, body and helpful count. Never labelled as carried
 * over.
 *
 * Z-P9 — `anonymous` are the app's live anonymous reviews from Zealot's signed
 * index. They are anonymous by design (no author), so they render as a visitor's
 * review but keep their body and the earned "verified install" mark. Optional and
 * defaulted to `[]`, so every existing caller is unchanged.
 */
export function mergeAppReviews(
  carriedOver: CarriedOverReview[],
  live: { id: string; stars: number; created_at: string; verified_install?: boolean }[],
  anonymous: AnonymousReview[] = []
): AppReview[] {
  const fromCarriedOver: AppReview[] = carriedOver.map((comment, index) => ({
    id: `carried-${index}-${comment.commented_on}`,
    author: comment.author_name,
    rating: comment.rating,
    body: comment.body,
    date: comment.commented_on,
    helpful_count: comment.helpful_count,
    dev_reply: comment.dev_reply ?? null,
    dev_replied_at: comment.dev_replied_at ?? null,
  }));
  const fromLive: AppReview[] = live.map((review) => ({
    id: review.id,
    author: "A visitor",
    rating: review.stars,
    body: null,
    date: review.created_at,
    helpful_count: 0,
    verified_install: review.verified_install ?? false,
  }));
  const fromAnonymous: AppReview[] = anonymous.map((review, index) => ({
    id: `anonymous-${index}-${review.created_at}`,
    author: "A visitor",
    rating: review.rating,
    body: review.body,
    date: review.created_at,
    helpful_count: review.helpful_count,
    verified_install: review.verified_install,
  }));
  return [...fromCarriedOver, ...fromLive, ...fromAnonymous].sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date) || a.id.localeCompare(b.id)
  );
}
