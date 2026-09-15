"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";

/**
 * Scroll-triggered reveal — leaf 3.a.i.zi (Phase 3, Animation System,
 * Scroll reveal), the reusable utility. Wiring it onto actual
 * shelves/hero sections is the next leaf, `3.a.i.zo` — this leaf is
 * only the primitive, the same "utility this leaf, consumers next
 * leaf" split `ShelfGrid` (`0.c.ii.zi`) → `AppCard` (`0.c.ii.zo`)
 * already used.
 *
 * A plain `IntersectionObserver` hook rather than a library, matching
 * this repo's existing preference for a native browser API over a
 * client dependency (`ScreenshotCarousel`, `0.e.i.zi`, made the same
 * call for its swipe behavior via CSS scroll-snap).
 *
 * Per docs/D-STORE.md §4.C — "Scroll-triggered reveal, respecting
 * `prefers-reduced-motion`" is one line item, not two — that's not a
 * follow-up concern left for the later reduced-motion leaf (`3.d.iii`,
 * a broader audit across every animation in the app). This hook checks
 * `prefers-reduced-motion` itself and, when set, returns `true`
 * immediately without ever observing, so a reduced-motion visitor sees
 * content in its final state from first paint rather than an
 * animation that merely skips itself later.
 *
 * Reveals once and disconnects — this is a "fade in as you scroll to
 * it" effect, not a repeating one, so there's no reason to keep
 * observing (and re-hide) an element that's already been seen.
 */
export function useScrollReveal<T extends HTMLElement>(): {
  ref: MutableRefObject<T | null>;
  isRevealed: boolean;
} {
  const ref = useRef<T | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, isRevealed };
}
