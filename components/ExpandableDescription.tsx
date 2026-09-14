"use client";

import { useState } from "react";
import styles from "./ExpandableDescription.module.css";

/**
 * Expandable description — leaf 0.e.ii.zi (App Detail Page → Content).
 * Per docs/D-STORE.md §4B: "Expandable 'Read more' description."
 *
 * Collapsed state shows the description as plain clamped text (CSS
 * `-webkit-line-clamp`, 4 lines) with a "Read more" button; expanded
 * state re-renders the same text with its actual paragraph/bullet
 * structure. `App.description` (lib/mock-data.ts) uses blank-line-
 * separated paragraphs and "- " bullet lines — F-Droid's entry is the
 * clearest example, transcribed from the app-detail screenshot's own
 * write-up. Collapsing back to plain clamped text discards that
 * structure again; that matches how Play Store's own toggle behaves
 * (structure only appears once expanded), not an oversight.
 *
 * The toggle button only renders when the description is long enough
 * to plausibly overflow 4 lines — a length heuristic, not a measured
 * DOM overflow check (no ResizeObserver here). Phase 0 descriptions are
 * static dummy strings, not user content, so a fixed threshold is
 * enough and avoids a redundant button on short one-liners like Simply
 * Solid's or Battery Live's.
 */

const COLLAPSE_THRESHOLD = 220;

function formatDescription(description: string) {
  return description.split("\n\n").map((block, blockIndex) => {
    const lines = block.split("\n").filter(Boolean);
    const isList = lines.length > 0 && lines.every((line) => line.trim().startsWith("- "));

    if (isList) {
      return (
        <ul key={blockIndex} className={styles.list}>
          {lines.map((line, lineIndex) => (
            <li key={lineIndex}>{line.replace(/^- /, "")}</li>
          ))}
        </ul>
      );
    }

    return (
      <p key={blockIndex} className={styles.paragraph}>
        {block}
      </p>
    );
  });
}

export default function ExpandableDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const canCollapse = description.length > COLLAPSE_THRESHOLD;

  return (
    <div className={styles.wrapper}>
      {expanded || !canCollapse ? (
        <div className={styles.formatted} id="app-description">
          {formatDescription(description)}
        </div>
      ) : (
        <p className={styles.clamped} id="app-description">
          {description}
        </p>
      )}

      {canCollapse && (
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls="app-description"
        >
          {expanded ? "Read less" : "Read more"}
        </button>
      )}
    </div>
  );
}
