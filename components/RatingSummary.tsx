import type { App } from "@/lib/catalog";
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
  const fillFractions = starFillFractions(app.avg_rating);
  const histogram = syntheticHistogram(app.avg_rating, app.rating_count);
  const maxCount = Math.max(...histogram.map((row) => row.count), 1);

  const histogramLabel = histogram
    .map((row) => `${row.star} star: ${row.count.toLocaleString()} ratings`)
    .join(", ");

  return (
    <div className={styles.wrapper}>
      <div className={styles.summary}>
        <span className={styles.average}>{app.avg_rating.toFixed(1)}</span>
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
        <span className={styles.count}>{app.rating_count.toLocaleString()} ratings</span>
      </div>

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
    </div>
  );
}
