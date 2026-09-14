"use client";

import { useState } from "react";
import styles from "./RateThisApp.module.css";

/**
 * Anonymous rating submission — leaf 0.e.iii.zo (App Detail Page →
 * Ratings), sibling to RatingSummary (0.e.iii.zi) in the same section.
 * Per HANDOVER.md 0.e.iii.zo: "dummy — updates local state only, no
 * backend."
 *
 * "Local state only" is scoped to this component's own submission flow:
 * picking a star and pressing Submit doesn't call any API — there is
 * none yet, `Review` (docs/D-STORE.md §7) is a Phase 5 entity — and
 * only updates this component's own `submitted` state to show a
 * confirmation. It deliberately does NOT reach up into RatingSummary
 * (0.e.iii.zi) to recompute the aggregate average or histogram:
 * simulating that merge convincingly (bumping `avg_rating` in place) is
 * a real aggregation a backend does, and faking it here would be more
 * misleading dummy behavior than useful, not less — noted as a
 * deliberate scope line, not a missed connection between the two
 * components.
 *
 * Anonymous, so there's no identity check and nothing stops submitting
 * more than once in a session — matches "anonymous" in the leaf name.
 * Rate-limiting it for real is explicitly a real-backend concern
 * (docs/D-STORE.md §7: "Review (anonymous, rate-limited)").
 */
export default function RateThisApp() {
  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [submitted, setSubmitted] = useState<number | null>(null);

  const display = hovered || selected;

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
        onClick={() => setSubmitted(selected)}
      >
        Submit rating
      </button>
    </div>
  );
}
