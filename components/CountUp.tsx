"use client";

import { useEffect, useRef, useState } from "react";
import { countUpValue } from "@/lib/count-up";
import { formatDownloadCount } from "@/lib/carried-over-stats";

const DURATION_MS = 1400;

function render(value: number, variant: "short" | "exact"): string {
  return variant === "short" ? formatDownloadCount(value) : value.toLocaleString();
}

/**
 * Counts a number up from 0 to `target` once, when it scrolls into view.
 *
 * The server renders the FINAL text, so the page is correct with JavaScript off, for crawlers and for
 * screen readers (which are given the final text only; the moving digits are aria-hidden). The animation
 * is skipped for visitors who prefer reduced motion. `variant` picks the format: "short" is the
 * Play-Store style `5.8M`, "exact" is the full number with separators.
 */
export default function CountUp({
  target,
  variant,
  suffix = "",
}: {
  target: number;
  variant: "short" | "exact";
  suffix?: string;
}) {
  const [value, setValue] = useState(target);
  const ref = useRef<HTMLSpanElement>(null);
  const finalText = `${render(target, variant)}${suffix}`;

  useEffect(() => {
    const node = ref.current;
    if (node === null || !(target > 0)) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;

    let frame = 0;
    let started = false;
    const observer = new IntersectionObserver((entries) => {
      if (started || !entries.some((entry) => entry.isIntersecting)) return;
      started = true;
      observer.disconnect();
      const begin = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - begin) / DURATION_MS, 1);
        setValue(countUpValue(target, progress));
        if (progress < 1) frame = requestAnimationFrame(tick);
        else setValue(target);
      };
      setValue(0);
      frame = requestAnimationFrame(tick);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [target]);

  return (
    <span ref={ref}>
      <span aria-hidden="true">{`${render(value, variant)}${suffix}`}</span>
      <span style={SR_ONLY}>{finalText}</span>
    </span>
  );
}

const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};
