import type { App } from "@/lib/mock-data";
import { anonymousReviewsFor, carriedOverReviewsFor, mergeAppReviews, type AppReview } from "@/lib/carried-over-stats";
import { reviewDateLabel, reviewInitial, splitReviews } from "@/lib/ratings";
import styles from "./ReviewsList.module.css";

/**
 * Task 45d: the app's reviews, newest first, shown as ordinary reviews with no "migrated" label anywhere.
 * Carried-over comments (Zealot's signed index, `App.carried_over_reviews`) and this store's own live star
 * submissions are merged into one list by date; only the backend knows which is which. Renders nothing when there
 * are no reviews at all, so an app with none is unchanged.
 *
 * This store's own live reviews are anonymous 1-5 star submissions with no text, so they show a star row and
 * "A visitor"; a carried-over comment shows its own author, star row, body and helpful count. Z-P9 live
 * anonymous reviews (device-bound key) also show "A visitor" but keep their body and, when earned, a
 * "Verified install" badge.
 *
 * Operator-directed 2026-10-08 (slice 4 of the details page rework): each review is a glass card with an initial
 * avatar (decorative), the author, the stars, the UTC date, the text and the helpful count. The first three show;
 * the rest sit behind a native `<details>` ("Show all N reviews"), so a long carried-over list no longer pushes
 * the permissions and the rest of the page far down, and it needs no JavaScript. Server component.
 */
function StarRow({ rating }: { rating: number }) {
  return (
    <span className={styles.stars} role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} aria-hidden="true" className={index < rating ? styles.starOn : styles.starOff}>
          ★
        </span>
      ))}
    </span>
  );
}

function ReviewItem({ review }: { review: AppReview }) {
  const date = reviewDateLabel(review.date);
  const replyDate = review.dev_replied_at ? reviewDateLabel(review.dev_replied_at) : null;
  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        <span className={styles.avatar} aria-hidden="true">
          {reviewInitial(review.author)}
        </span>
        <div className={styles.who}>
          <span className={styles.author}>{review.author}</span>
          {review.verified_install && (
            // Z-P9 — the earned "verified install" mark: the review carried a device key that passed Android
            // Key Attestation and named a real release of this app. Shown only when the publisher set it.
            <span className={styles.verified}>Verified install</span>
          )}
          <div className={styles.sub}>
            <StarRow rating={review.rating} />
            {date && <span className={styles.date}>{date}</span>}
          </div>
        </div>
      </div>
      {review.body && <p className={styles.body}>{review.body}</p>}
      {review.helpful_count > 0 && (
        <p className={styles.helpful}>
          {review.helpful_count.toLocaleString("en-US")} {review.helpful_count === 1 ? "person" : "people"} found this
          helpful
        </p>
      )}
      {review.dev_reply && (
        // Card D-P6 — the developer's public reply, published by the Console's reviews inbox (Z-P8).
        // Renders only when the publisher actually answered; nothing otherwise.
        <div className={styles.devReply}>
          <span className={styles.devReplyLabel}>
            Developer reply{replyDate ? ` · ${replyDate}` : ""}
          </span>
          <p className={styles.devReplyBody}>{review.dev_reply}</p>
        </div>
      )}
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
  const reviews = mergeAppReviews(carriedOverReviewsFor(app), liveReviews, anonymousReviewsFor(app));
  if (reviews.length === 0) return null;
  const { shown, rest } = splitReviews(reviews);

  return (
    <div className={styles.root}>
      <h3 className={styles.heading}>Reviews</h3>
      <ul className={styles.list}>
        {shown.map((review) => (
          <ReviewItem key={review.id} review={review} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className={styles.more}>
          <summary className={styles.moreToggle}>
            <span className={styles.moreClosed}>Show all {reviews.length.toLocaleString("en-US")} reviews</span>
            <span className={styles.moreOpen}>Show fewer reviews</span>
          </summary>
          <ul className={styles.list}>
            {rest.map((review) => (
              <ReviewItem key={review.id} review={review} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
