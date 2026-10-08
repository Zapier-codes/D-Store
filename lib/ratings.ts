/**
 * Pure helpers for the details page's ratings and reviews (operator-directed 2026-10-08, slice 4 of the details
 * page rework, brief section 5E). No I/O, no React.
 *
 * The honest-histogram rule: a per-star breakdown is shown ONLY where the source gave real vote counts (a
 * third-party app's `votes`). A first-party app has an average and a count but no per-star counts, and the old
 * `RatingSummary` invented them with a Gaussian curve centred on the average, which presented made-up numbers as
 * real. That synthesis is gone: a first-party app shows its average and count only.
 */
import type { App } from "./mock-data";
import { isThirdParty } from "./trust";
import { reportedStatsFor } from "./third-party-stats";
import { combinedRating } from "./carried-over-stats";

export interface HistogramRow {
  star: 5 | 4 | 3 | 2 | 1;
  count: number;
  /** This row's bar length as 0..100, relative to the biggest row (so the biggest bar is full). */
  percent: number;
}

export interface RatingSummaryData {
  average: number;
  count: number;
  /** Real per-star rows, 5 down to 1, or `null` when the source gave none (never synthesized). */
  histogram: HistogramRow[] | null;
}

/** Rows 5 to 1 from real votes; missing stars count as 0. `null` for no votes, bad data, or all zeros. */
export function histogramRows(
  votes: readonly { star: number; count: number }[] | null | undefined,
): HistogramRow[] | null {
  if (!Array.isArray(votes) || votes.length === 0) return null;
  const byStar = new Map<number, number>();
  for (const vote of votes) {
    if (!vote || !Number.isInteger(vote.star) || vote.star < 1 || vote.star > 5) continue;
    if (!Number.isFinite(vote.count) || vote.count < 0) continue;
    byStar.set(vote.star, (byStar.get(vote.star) ?? 0) + Math.floor(vote.count));
  }
  const stars = [5, 4, 3, 2, 1] as const;
  const counts = stars.map((star) => byStar.get(star) ?? 0);
  const max = Math.max(...counts);
  if (max <= 0) return null;
  return stars.map((star, i) => ({
    star,
    count: counts[i],
    percent: Math.round((counts[i] / max) * 1000) / 10,
  }));
}

/**
 * What the Ratings panel shows for an app, or `null` for nothing at all (no rating figure is shown rather than
 * `0.0` and `0 ratings`). First-party: the weighted carried-over average if there is one, else this store's own;
 * never a histogram. Third-party: the source's own average, total and real votes.
 */
export function ratingSummaryFor(app: App): RatingSummaryData | null {
  if (isThirdParty(app)) {
    const reported = reportedStatsFor(app)?.rating ?? null;
    if (reported === null || !(reported.total > 0) || !Number.isFinite(reported.average)) return null;
    return { average: reported.average, count: reported.total, histogram: histogramRows(reported.votes) };
  }
  const combined = combinedRating(app);
  const average = combined?.average ?? app.avg_rating;
  const count = combined?.count ?? app.rating_count;
  if (!Number.isFinite(average) || !Number.isFinite(count) || count <= 0 || average <= 0) return null;
  return { average, count, histogram: null };
}

/** True for a third-party app whose source reports zero ratings (the page says "No ratings yet." for it). */
export function reportsNoRatings(app: App): boolean {
  if (!isThirdParty(app)) return false;
  const reported = reportedStatsFor(app)?.rating ?? null;
  return reported !== null && reported.total === 0;
}

/** The average to one decimal as text, e.g. `4.6`; `"0.0"` for anything unusable. */
export function averageText(average: number): string {
  return Number.isFinite(average) && average > 0 ? average.toFixed(1) : "0.0";
}

/** The `index`-th of 5 stars' hover and confirm delay in ms, so a confirm ripples left to right. */
export function starRippleDelay(index: number, stepMs = 70): number {
  if (!Number.isInteger(index) || index < 0) return 0;
  return index * stepMs;
}

/** One-line spoken summary of the rows, e.g. `5 star: 41 ratings, 4 star: 1 ratings, ...`. */
export function histogramLabel(rows: readonly HistogramRow[]): string {
  return rows.map((row) => `${row.star} star: ${row.count.toLocaleString("en-US")} ratings`).join(", ");
}

/** The first letter of a review author's name, uppercase, for the avatar circle; `?` when there is none. */
export function reviewInitial(author: string | null | undefined): string {
  if (typeof author !== "string") return "?";
  const first = Array.from(author.trim())[0];
  return first ? first.toUpperCase() : "?";
}

/** A review date as `Oct 8, 2026` in UTC (server and browser agree); `""` for a missing or invalid date. */
export function reviewDateLabel(iso: string | null | undefined): string {
  if (typeof iso !== "string" || iso.length === 0) return "";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  return new Date(time).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** How many reviews show before the "Show all" fold. */
export const REVIEWS_SHOWN_FIRST = 3;

/** Split reviews into the ones shown at once and the rest behind the fold. */
export function splitReviews<T>(reviews: readonly T[], first = REVIEWS_SHOWN_FIRST): { shown: T[]; rest: T[] } {
  const n = Math.max(0, Math.floor(first));
  return { shown: reviews.slice(0, n), rest: reviews.slice(n) };
}
