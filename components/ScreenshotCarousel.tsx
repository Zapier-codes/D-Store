"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { App } from "@/lib/catalog";
import { isRealImageUrl, isOptimizableImageUrl } from "@/lib/image";
import { ambientArtFor, nearestSlideIndex, shapeOf, usableScreenshots, type SlideShape } from "@/lib/gallery";
import { Tilt } from "./glass";
import Lightbox from "./Lightbox";
import styles from "./ScreenshotCarousel.module.css";

/**
 * Screenshot gallery: operator-directed 2026-10-08, slice 3 of the details page rework (brief section 5C).
 * History: leaf 0.e.i.zi (carousel), 0.e.i.zo (lightbox), 3.d.ii.zi (real images).
 *
 * What changed in slice 3:
 *  - The component now owns its whole section, heading included, and renders nothing (no orphan "Screenshots"
 *    heading) for an app with no usable screenshots. `page.tsx` just renders `<ScreenshotCarousel app />`.
 *  - Slides are sized by height (one `--shot-h` per breakpoint), so a portrait and a landscape shot sit in the same
 *    row without a layout jump. The data carries no image dimensions, so every real shot starts portrait (9:16, the
 *    reserved box) and a landscape one widens once its pixels say so: the height never changes, only that slide's
 *    width, and only inside the scroller (the page cannot shift).
 *  - A blurred, low-opacity copy of the active shot (and its two neighbours) sits behind the row as ambient light:
 *    ONE blurred wrapper, only opacity animates, nothing loops. Active shot = nearest to the scroll position.
 *  - Mouse users get a small tilt on the shot under the pointer (the shared `Tilt`, mouse only) and prev/next glass
 *    buttons; touch users swipe the native scroll-snap row, with the next shot peeking in at the edge.
 *  - Keyboard: each shot is a button (Tab moves through them and the browser scrolls the focused one into view);
 *    ArrowLeft / ArrowRight on a shot move focus to the neighbour.
 *  - Reduced motion: no smooth scrolling, no tilt (Tilt checks), no fade or press scale.
 * The lightbox is still the native `<dialog>`; it now also takes the shapes seen here so its box matches.
 */
export default function ScreenshotCarousel({ app }: { app: App }) {
  const screenshots = usableScreenshots(app.screenshots);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [shapes, setShapes] = useState<Record<number, SlideShape>>({});
  const trackRef = useRef<HTMLUListElement>(null);
  const frame = useRef<number | null>(null);

  const count = screenshots.length;

  const slideNodes = useCallback((): HTMLLIElement[] => {
    const track = trackRef.current;
    return track ? Array.from(track.querySelectorAll<HTMLLIElement>(":scope > li")) : [];
  }, []);

  const syncActive = useCallback(() => {
    frame.current = null;
    const track = trackRef.current;
    if (!track) return;
    const nodes = slideNodes();
    if (nodes.length === 0) return;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    const next = atEnd ? nodes.length - 1 : nearestSlideIndex(nodes.map((n) => n.offsetLeft), track.scrollLeft);
    setActive((current) => (current === next ? current : next));
  }, [slideNodes]);

  const onScroll = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(syncActive);
  }, [syncActive]);

  useEffect(() => {
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  const goTo = useCallback(
    (index: number, focus = false) => {
      const nodes = slideNodes();
      const node = nodes[index];
      const track = trackRef.current;
      if (!node || !track) return;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      track.scrollTo({ left: node.offsetLeft, behavior: reduce ? "auto" : "smooth" });
      if (focus) node.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    },
    [slideNodes],
  );

  if (count === 0) return null;

  const colors = [app.primary_color, app.secondary_color, app.tertiary_color];

  // Ambient light: the active shot and its neighbours, only those that are safe real https images.
  const ambient = [active - 1, active, active + 1]
    .filter((i) => i >= 0 && i < count)
    .map((i) => ({ i, src: ambientArtFor(screenshots[i]) }))
    .filter((a): a is { i: number; src: string } => a.src !== null);

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>, index: number) => {
    if (event.key === "ArrowRight" && index < count - 1) {
      event.preventDefault();
      goTo(index + 1, true);
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      goTo(index - 1, true);
    }
  };

  return (
    <section className={styles.gallery} aria-labelledby="screenshots-heading">
      {ambient.length > 0 && (
        <div className={styles.ambient} aria-hidden="true">
          {ambient.map(({ i, src }) => (
            <div
              key={i}
              className={`${styles.ambientLayer} ${i === active ? styles.ambientOn : ""}`}
              style={{ backgroundImage: `url(${JSON.stringify(src)})` }}
            />
          ))}
        </div>
      )}

      <h2 id="screenshots-heading" className={styles.title}>
        Screenshots
      </h2>

      <div className={styles.carousel} role="region" aria-label={`${app.name} screenshots`}>
        <ul ref={trackRef} className={styles.track} onScroll={onScroll}>
          {screenshots.map((src, index) => {
            const landscape = shapes[index] === "landscape";
            const real = isRealImageUrl(src);
            return (
              <li key={`${index}-${src}`} className={styles.slide}>
                <Tilt className={styles.tilt}>
                  <button
                    type="button"
                    className={styles.slideButton}
                    onClick={() => setLightboxIndex(index)}
                    onKeyDown={(e) => onKeyDown(e, index)}
                    aria-label={`View screenshot ${index + 1} of ${count} full size`}
                  >
                    {real ? (
                      <div className={`${styles.frame} ${landscape ? styles.landscape : ""}`}>
                        <Image
                          src={src}
                          alt={`${app.name} — Screenshot ${index + 1}`}
                          fill
                          loading={index < 2 ? "eager" : "lazy"}
                          unoptimized={!isOptimizableImageUrl(src)}
                          sizes={landscape ? "(min-width: 768px) 780px, 90vw" : "(min-width: 768px) 270px, 200px"}
                          style={{ objectFit: "cover" }}
                          onLoad={(event) => {
                            const img = event.currentTarget;
                            const shape = shapeOf(img.naturalWidth, img.naturalHeight);
                            if (shape === "landscape") {
                              setShapes((prev) => (prev[index] === "landscape" ? prev : { ...prev, [index]: "landscape" }));
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        className={`${styles.frame} ${styles.placeholder}`}
                        style={{
                          backgroundColor: colors[index % colors.length],
                          color: app.primary_color === colors[index % colors.length] ? app.secondary_color : app.primary_color,
                        }}
                      >
                        <span className={styles.placeholderLabel}>
                          {app.name} — Screenshot {index + 1}
                        </span>
                      </div>
                    )}
                  </button>
                </Tilt>
                <span className={styles.srOnly}>
                  Screenshot {index + 1} of {count}
                </span>
              </li>
            );
          })}
        </ul>

        {count > 1 && (
          <>
            <button
              type="button"
              className={`${styles.arrow} ${styles.arrowPrev}`}
              onClick={() => goTo(active - 1)}
              disabled={active === 0}
              aria-label="Previous screenshot"
            >
              ‹
            </button>
            <button
              type="button"
              className={`${styles.arrow} ${styles.arrowNext}`}
              onClick={() => goTo(active + 1)}
              disabled={active === count - 1}
              aria-label="Next screenshot"
            >
              ›
            </button>
          </>
        )}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          appName={app.name}
          primaryColor={app.primary_color}
          secondaryColor={app.secondary_color}
          screenshotCount={count}
          colors={colors}
          screenshots={screenshots}
          shapes={shapes}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </section>
  );
}
