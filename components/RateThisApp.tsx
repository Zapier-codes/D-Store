"use client";

import { useState } from "react";
import styles from "./RateThisApp.module.css";

/**
 * Anonymous rating submission — leaf 0.e.iii.zo (App Detail Page →
 * Ratings), sibling to RatingSummary (0.e.iii.zi) in the same section.
 *
 * Originally "dummy — updates local state only, no backend" per
 * HANDOVER.md's 0.e.iii.zo note, deliberately *not* reaching up into
 * RatingSummary to recompute the aggregate: there was no real
 * aggregation to reach into yet, and faking that merge would have
 * been more misleading than useful. Leaf `3.b.ii.zi` built that real
 * aggregation (`submitReview`, `lib/catalog.ts`), so this component
 * now does reach it — a real `POST /api/apps/[slug]/reviews`, not a
 * simulation. `submitted` still only tracks *this component's own*
 * confirmation state (which star value to show in the thank-you
 * message); it isn't holding the app's aggregate, which lives back on
 * the server and shows up correctly on this page's next full load
 * (`RatingSummary` reads `App.avg_rating`/`rating_count` fresh every
 * request, same as it always has) — this component doesn't attempt
 * to optimistically patch that number in place mid-session, which
 * would be a separate, not-yet-scoped piece of work.
 *
 * Anonymous, so there's no identity check and nothing stops submitting
 * more than once in a session — matches "anonymous" in the leaf name.
 * Rate-limiting it for real is explicitly a real-backend concern
 * (docs/D-STORE.md §7: "Review (anonymous, rate-limited)"), same as
 * noted on the endpoint itself.
 *
 * The submit click still resolves to the confirmation view even if
 * the request fails — same "never block the dummy interaction on a
 * failed ping" posture `InstallButton`/`ViewPing` already take, since
 * a star-rating confirmation isn't worth stalling on a network round
 * trip the person didn't ask to wait for.
 */
export default function RateThisApp({ appSlug }: { appSlug: string }) {
  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [submitted, setSubmitted] = useState<number | null>(null);

  const display = hovered || selected;

  function handleSubmit() {
    setSubmitted(selected);
    fetch(`/api/apps/${appSlug}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stars: selected }),
    }).catch(() => {});
  }

  if (submitted !== null) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.confirmation} role="status">
          Thanks for rating this app {submitted} {submitted === 1 ? "star" : "stars"}!
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <p className={styles.prompt} id="rate-this-app-label">
        Rate this app
      </p>
      <div className={styles.picker} role="radiogroup" aria-labelledby="rate-this-app-label">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected === value}
            aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
            className={styles.starButton}
            onMouseEnter={() => setHovered(value)}
            onMouseLeave={() => setHovered(0)}
            onFocus={() => setHovered(value)}
            onBlur={() => setHovered(0)}
            onClick={() => setSelected(value)}
          >
            <span className={value <= display ? styles.starFull : styles.starEmpty} aria-hidden="true">
              ★
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className={styles.submit}
        disabled={selected === 0}
        onClick={handleSubmit}
      >
        Submit rating
      </button>
    </div>
  );
}
