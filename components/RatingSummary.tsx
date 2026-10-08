import type { App } from "@/lib/catalog";
import { isThirdParty } from "@/lib/trust";
import { reportedStatsFor } from "@/lib/third-party-stats";
import { combinedRating } from "@/lib/carried-over-stats";
import styles from "./RatingSummary.module.css";

/**
 * Rating stars + histogram — leaf 0.e.iii.zi (App Detail Page →
 * Ratings). Per docs/D-STORE.md §4B: "Rating stars + histogram."
 *
 * `App.avg_rating`/`App.rating_count` (lib/mock-data.ts) are aggregate
 * fields only — same gap the legacy `Application` entity had (no
 * per-star breakdown, no reviews at all; docs/D-STORE.md §7 notes a new
 * `Review` entity is needed before real histograms exist). This
 * component synthesizes a plausible 5-bucket histogram from those two
 * numbers using a fixed Gaussian kernel centered on `avg_rating` —
 * deterministic, not random, so the same app always renders the same
 * histogram (no server/client render mismatch, no flicker on refresh).
 * Once Phase 5 adds real `Review` rows, this synthesis function is what
 * gets deleted — `getRatingHistogram` in lib/catalog.ts (if a future
 * leaf wants it fetched rather than computed inline) would query actual
 * grouped counts instead.
 *
 * Star fill is a continuous fraction per star (not just full/half/empty)
 * — e.g. avg 4.6 renders 4 full stars plus a 5th star filled 60% —
 * via a clipped foreground glyph layered over a muted background glyph,
 * matching how Play Store's own rating stars render fractional fill.
 *
 * `5.h.vii.zo` — a third-party app is different: its own average, count and
 * REAL vote histogram come from the source (`App.third_party_stats`) and are
 * shown labelled as the source's, never as D-Store visitors' ratings. The
 * synthetic histogram below is for first-party apps only; a third-party app
 * whose histogram is missing or does not add up (`votes: null`) gets no bars
 * rather than an invented set.
 */

function starFillFractions(avgRating: number): number[] {
  return Array.from({ length: 5 }, (_, index) => {
    const fraction = avgRating - index;
    return Math.min(1, Math.max(0, fraction));
  });
}

function syntheticHistogram(avgRating: number, ratingCount: number) {
  const sigma = 0.9;
  const stars = [5, 4, 3, 2, 1];
  const weights = stars.map((star) => Math.exp(-((star - avgRating) ** 2) / (2 * sigma * sigma)));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  const counts = weights.map((w) => Math.round((w / totalWeight) * ratingCount));

  // Rounding can drift the sum away from ratingCount by a star or two;
  // correct it against the largest bucket so the bars still sum to the
  // displayed rating_count exactly.
  const drift = ratingCount - counts.reduce((sum, c) => sum + c, 0);
  if (drift !== 0 && counts.length > 0) {
    const maxIndex = counts.indexOf(Math.max(...counts));
    counts[maxIndex] += drift;
  }

  return stars.map((star, index) => ({ star, count: Math.max(0, counts[index]) }));
}

export default function RatingSummary({ app }: { app: App }) {
  const thirdParty = isThirdParty(app);
  const reported = thirdParty ? reportedStatsFor(app)?.rating ?? null : null;

  // Operator, 2026-10-08: a source that gave no rating shows nothing; no source is named anywhere.
  if (thirdParty && reported === null) return null;
  if (thirdParty && reported !== null && reported.total === 0) {
    return <p className={styles.source}>No ratings yet.</p>;
  }

  const combined = thirdParty ? null : combinedRating(app);
  const average = thirdParty ? reported!.average : (combined?.average ?? app.avg_rating);
  const ratingCount = thirdParty ? reported!.total : (combined?.count ?? app.rating_count);
  const histogram = thirdParty
    ? (reported!.votes ?? []).map((vote) => ({ star: vote.star as number, count: vote.count }))
    : syntheticHistogram(average, ratingCount);

  const fillFractions = starFillFractions(average);
  const maxCount = Math.max(...histogram.map((row) => row.count), 1);

  const histogramLabel = histogram
    .map((row) => `${row.star} star: ${row.count.toLocaleString()} ratings`)
    .join(", ");

  return (
    <div className={styles.wrapper}>
      <div className={styles.summary}>
        <span className={styles.average}>{average.toFixed(1)}</span>
        <div className={styles.stars} aria-hidden="true">
          {fillFractions.map((fraction, index) => (
            <span key={index} className={styles.starWrap}>
              <span className={styles.starEmpty}>★</span>
              <span className={styles.starFillClip} style={{ width: `${fraction * 100}%` }}>
                <span className={styles.starFull}>★</span>
              </span>
            </span>
          ))}
        </div>
        <span className={styles.count}>{ratingCount.toLocaleString()} ratings</span>
      </div>

      {histogram.length > 0 && (
        <div className={styles.histogram} role="img" aria-label={`Rating breakdown: ${histogramLabel}`}>
          {histogram.map((row) => (
            <div key={row.star} className={styles.row} aria-hidden="true">
              <span className={styles.rowLabel}>{row.star}</span>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${(row.count / maxCount) * 100}%` }} />
              </div>
              <span className={styles.rowCount}>{row.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
