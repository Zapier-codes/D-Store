"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./Hero.module.css";

/** How long a card stays before the row moves to the next one. */
const ADVANCE_MS = 5500;
/** After the visitor touches, wheels or presses the row, auto-advance waits this long. */
const IDLE_RESUME_MS = 9000;

/**
 * Scrolling row for the home hero (see `Hero.tsx`). Receives the already-rendered cards as children
 * and adds the behaviour only a client can: horizontal scroll-snap, "which card is showing", the dots,
 * and the automatic advance.
 *
 * - One card: it fills the width, no dots, nothing scrolls and nothing advances.
 * - More than one card: the row scrolls sideways (swipe, trackpad, keyboard focus) and, unless the
 *   visitor prefers reduced motion, moves to the next card every `ADVANCE_MS`, wrapping back to the
 *   first after the last. It never moves while the visitor is hovering, focusing or has just touched
 *   it, while the tab is hidden, or while the row is off screen. The scroll is on the row itself
 *   (`scrollTo`), never `scrollIntoView`, so it can never pull the page up or down.
 */
export default function HeroCarousel({ children, label }: { children: ReactNode; label: string }) {
  const slides = Children.toArray(children);
  const count = slides.length;

  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // Mutable state the interval reads without re-creating the timer.
  const activeRef = useRef(0);
  const hoverRef = useRef(false);
  const focusRef = useRef(false);
  const visibleRef = useRef(true);
  const idleUntilRef = useRef(0);
  const reducedMotionRef = useRef(false);

  const goTo = useCallback((index: number, smooth: boolean) => {
    const track = trackRef.current;
    const slide = track?.children[index] as HTMLElement | undefined;
    if (!track || !slide) return;
    const padLeft = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    track.scrollTo({ left: Math.max(0, slide.offsetLeft - padLeft), behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Which card is showing: the one whose left edge is nearest the row's left edge.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || count < 2) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const padLeft = parseFloat(getComputedStyle(track).paddingLeft) || 0;
      const left = track.scrollLeft + padLeft;
      let best = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < track.children.length; i += 1) {
        const distance = Math.abs((track.children[i] as HTMLElement).offsetLeft - left);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }
      activeRef.current = best;
      setActive(best);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [count]);

  // Automatic advance.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || count < 2) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = media.matches;
    const onMedia = () => {
      reducedMotionRef.current = media.matches;
    };
    media.addEventListener("change", onMedia);

    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              visibleRef.current = entries.some((entry) => entry.isIntersecting);
            },
            { threshold: 0.35 }
          );
    observer?.observe(track);

    const timer = window.setInterval(() => {
      if (reducedMotionRef.current) return;
      if (document.hidden || !visibleRef.current) return;
      if (hoverRef.current || focusRef.current) return;
      if (Date.now() < idleUntilRef.current) return;
      goTo((activeRef.current + 1) % count, true);
    }, ADVANCE_MS);

    return () => {
      window.clearInterval(timer);
      observer?.disconnect();
      media.removeEventListener("change", onMedia);
    };
  }, [count, goTo]);

  const holdAutoAdvance = () => {
    idleUntilRef.current = Date.now() + IDLE_RESUME_MS;
  };

  return (
    <section className={styles.hero} aria-roledescription="carousel" aria-label={label}>
      <div
        ref={trackRef}
        className={styles.track}
        data-single={count < 2 ? "true" : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") hoverRef.current = true;
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") hoverRef.current = false;
        }}
        onPointerDown={holdAutoAdvance}
        onTouchStart={holdAutoAdvance}
        onWheel={holdAutoAdvance}
        onFocusCapture={() => {
          focusRef.current = true;
        }}
        onBlurCapture={() => {
          focusRef.current = false;
        }}
      >
        {slides.map((slide, index) => (
          <div
            key={index}
            className={styles.slide}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${count}`}
          >
            {slide}
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className={styles.dots}>
          {slides.map((_, index) => (
            <button
              key={index}
              type="button"
              className={styles.dot}
              aria-label={`Show featured app ${index + 1} of ${count}`}
              aria-current={index === active ? "true" : undefined}
              onClick={() => {
                holdAutoAdvance();
                goTo(index, true);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
