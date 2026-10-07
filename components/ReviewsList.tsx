import type { App } from "@/lib/mock-data";
import { carriedOverReviewsFor, mergeAppReviews, type AppReview } from "@/lib/carried-over-stats";
import styles from "./ReviewsList.module.css";

/**
 * Task 45d — the app's reviews, oldest-merged-newest-first, shown as ordinary
 * reviews with no "migrated" label anywhere. Carried-over comments (Zealot's
 * signed index, `App.carried_over_reviews`) and this store's own live star
 * submissions are merged into one list by date; only the backend knows which is
 * which. Renders nothing when there are no reviews at all, so an app with none
 * is unchanged.
 *
 * This store's own live reviews are anonymous 1-5 star submissions with no text,
 * so they show a star row and "A visitor"; a carried-over comment shows its own
 * author, star row, body and helpful count. Dates are shown as the calendar day.
 */
function formatDay(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function StarRow({ rating }: { rating: number }) {
  return (
    <span className={styles.stars} aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} aria-hidden="true" className={index < rating ? styles.starOn : styles.starOff}>
          ★
        </span>
      ))}
    </span>
  );
}

function ReviewItem({ review }: { review: AppReview }) {
  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        <span className={styles.author}>{review.author}</span>
        <StarRow rating={review.rating} />
      </div>
      {review.body && <p className={styles.body}>{review.body}</p>}
      <div className={styles.meta}>
        <span>{formatDay(review.date)}</span>
        {review.helpful_count > 0 && (
          <span>
            {review.helpful_count.toLocaleString()} {review.helpful_count === 1 ? "person" : "people"} found this
            helpful
          </span>
        )}
      </div>
    </li>
  );
}

export default function ReviewsList({
  app,
  liveReviews,
}: {
  app: App;
  liveReviews: { id: string; stars: number; created_at: string }[];
}) {
  const reviews = mergeAppReviews(carriedOverReviewsFor(app), liveReviews);
  if (reviews.length === 0) return null;

  return (
    <ul className={styles.list}>
      {reviews.map((review) => (
        <ReviewItem key={review.id} review={review} />
      ))}
    </ul>
  );
}
