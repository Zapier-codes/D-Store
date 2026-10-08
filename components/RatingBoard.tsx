"use client";

import { useEffect, useRef, useState } from "react";
import { countUpValue } from "@/lib/count-up";
import { averageText, histogramLabel, type HistogramRow } from "@/lib/ratings";
import { StarMeter } from "./glass";
import styles from "./RatingBoard.module.css";

/**
 * The Ratings panel: operator-directed 2026-10-08, slice 4 of the details page rework (brief section 5E).
 * Replaces the body of `RatingSummary` (which now only decides WHAT to show, via `lib/ratings.ts`).
 *
 * One glass panel: the average as a large figure that counts up once when scrolled into view, the fractional
 * star meter, the count, and, ONLY where the source gave real per-star votes, the histogram, whose bars grow in
 * once when scrolled into view. A first-party app has no per-star counts, so it gets the figure, meter and count
 * with no bars (the old Gaussian "histogram" invented numbers and is gone).
 *
 * Same contract as `CountUp`: the server renders the FINAL text and the FINAL bar lengths, so the page is
 * correct without JavaScript, for crawlers and for screen readers (the moving figure is `aria-hidden`; the group
 * carries one spoken summary). After hydration, and only if the visitor does not prefer reduced motion and
 * IntersectionObserver exists, the bars are set to zero length ("armed") and released when the panel is half
 * visible. Only `transform` animates, once, never looping. The panel sits below the fold on a phone, so the brief
 * reset to zero is not seen; if it sits in view on load (a tall screen) it may flash final then reset, the same
 * trade-off `CountUp` documents.
 */
const DURATION_MS = 1100;

type Phase = "static" | "armed" | "shown";

export default function RatingBoard({
  average,
  count,
  histogram,
}: {
  average: number;
  count: number;
  histogram: HistogramRow[] | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const finalText = averageText(average);
  const [figure, setFigure] = useState(finalText);
  const [phase, setPhase] = useState<Phase>("static");

  useEffect(() => {
    const node = rootRef.current;
    if (node === null) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;

    let frame = 0;
    let started = false;
    const tenths = Math.round(average * 10);
    setPhase("armed");
    setFigure((0).toFixed(1));

    const observer = new IntersectionObserver(
      (entries) => {
        if (started || !entries.some((entry) => entry.isIntersecting)) return;
        started = true;
        observer.disconnect();
        setPhase("shown");
        const begin = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - begin) / DURATION_MS, 1);
          setFigure((countUpValue(tenths, progress) / 10).toFixed(1));
          if (progress < 1) frame = requestAnimationFrame(tick);
          else setFigure(finalText);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [average, finalText]);

  const spoken = `Rated ${finalText} out of 5 from ${count.toLocaleString("en-US")} ${count === 1 ? "rating" : "ratings"}`;

  return (
    <div ref={rootRef} className={styles.root}>
      <div className={styles.panel}>
        <div className={styles.summary} role="img" aria-label={spoken}>
          <span className={styles.average} aria-hidden="true">
            {figure}
          </span>
          <StarMeter average={average} className={styles.meter} />
          <span className={styles.count} aria-hidden="true">
            {count.toLocaleString("en-US")} {count === 1 ? "rating" : "ratings"}
          </span>
        </div>

        {histogram && (
          <div
            className={`${styles.bars} ${phase === "armed" ? styles.armed : ""} ${phase === "shown" ? styles.shown : ""}`}
            role="img"
            aria-label={`Rating breakdown: ${histogramLabel(histogram)}`}
          >
            {histogram.map((row) => (
              <div key={row.star} className={styles.row} aria-hidden="true">
                <span className={styles.rowLabel}>{row.star}</span>
                <div className={styles.track}>
                  <div className={styles.fill} style={{ "--p": row.percent / 100 } as React.CSSProperties} />
                </div>
                <span className={styles.rowCount}>{row.count.toLocaleString("en-US")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
