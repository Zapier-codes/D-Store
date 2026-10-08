"use client";

import { useId, useState } from "react";
import { canCollapseDescription, descriptionBlocks, usableDescription } from "@/lib/about-text";
import styles from "./ExpandableDescription.module.css";

/**
 * "About this app": leaf 0.e.ii.zi (expandable description), restyled by operator-directed 2026-10-08 (slice 5
 * of the details page rework, brief section 5D).
 *
 * It owns its whole section and the heading, like the screenshot gallery, and renders nothing when the source
 * gave no description (so no empty heading is left behind; `page.tsx` just renders
 * `<ExpandableDescription description={app.description} />`). The text sits in the shared glass panel. Collapsed,
 * it is the first five lines, fading out at the bottom (a mask on the text itself, so it works over any
 * backdrop) with a glass "Read more" pill under it; expanded, the same text shows with its real paragraph and
 * bullet structure and the pill reads "Read less". Structure only appears once expanded: that matches how Play's
 * own toggle behaves, it is not an oversight. A short description has no pill and no fade.
 *
 * The collapse decision is a length heuristic (`canCollapseDescription`), not a measured overflow, as before:
 * descriptions are static strings from the catalog, so a fixed threshold avoids a ResizeObserver. Nothing moves
 * on a timer and nothing animates, so reduced motion needs no special case. The collapsed text is still all in
 * the DOM, so a screen reader reads the whole description either way.
 */
export default function ExpandableDescription({ description }: { description: string | null | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const textId = useId();
  const headingId = `${textId}-heading`;
  const text = usableDescription(description);
  if (!text) return null;

  const canCollapse = canCollapseDescription(text);
  const collapsed = canCollapse && !expanded;

  return (
    <section className={styles.root} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.title}>
        About this app
      </h2>
      <div className={styles.panel}>
        {collapsed ? (
          <p className={styles.clamped} id={textId}>
            {text}
          </p>
        ) : (
          <div className={styles.formatted} id={textId}>
            {descriptionBlocks(text).map((block, index) =>
              block.kind === "list" ? (
                <ul key={index} className={styles.list}>
                  {block.items.map((item, itemIndex) => (
                    <li key={itemIndex}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p key={index} className={styles.paragraph}>
                  {block.text}
                </p>
              ),
            )}
          </div>
        )}

        {canCollapse && (
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls={textId}
          >
            {expanded ? "Read less" : "Read more"}
          </button>
        )}
      </div>
    </section>
  );
}
