import type { App } from "@/lib/catalog";
import { ratingSummaryFor, reportsNoRatings } from "@/lib/ratings";
import RatingBoard from "./RatingBoard";
import styles from "./RatingSummary.module.css";

/**
 * Rating summary: leaf 0.e.iii.zi, rewritten by operator-directed 2026-10-08 (slice 4 of the details page rework).
 *
 * This file now only decides WHAT to show (all of it in the pure `lib/ratings.ts`, tested); the glass panel, the
 * counting figure and the growing bars are `RatingBoard`.
 *
 * The old version drew a per-star histogram for a FIRST-PARTY app too, synthesized from the average and the count
 * with a Gaussian curve (the file's own header called it "not real votes"). Those bars were invented numbers shown
 * as if visitors had cast them, so they are removed: a first-party app shows its average, meter and count only
 * (the weighted carried-over average when there is one, see `combinedRating`). A third-party app (5.h.vii.zo) shows
 * its source's own average, total and REAL vote histogram, unlabelled (no source is named anywhere on the page);
 * a missing or inconsistent `votes` gives no bars rather than made-up ones. An app with no usable rating shows no
 * figure at all, not `0.0` and `0 ratings`; a third-party app whose source reports zero ratings says "No ratings yet.".
 */
export default function RatingSummary({ app }: { app: App }) {
  if (reportsNoRatings(app)) return <p className={styles.source}>No ratings yet.</p>;
  const summary = ratingSummaryFor(app);
  if (summary === null) return null;
  return <RatingBoard average={summary.average} count={summary.count} histogram={summary.histogram} />;
}
