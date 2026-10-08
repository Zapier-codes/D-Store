"use client";

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import Image from "next/image";
import { isRealImageUrl, isOptimizableImageUrl } from "@/lib/image";
import { neighbourIndexes, swipeStep, wrapIndex, type SlideShape } from "@/lib/gallery";
import styles from "./Lightbox.module.css";

/**
 * Lightbox viewer — leaf 0.e.i.zo (App Detail Page → Media).
 *
 * Opens when a screenshot slide in ScreenshotCarousel (0.e.i.zi) is
 * activated, showing that screenshot full-size with prev/next
 * navigation across the whole set. Built on the native `<dialog>`
 * element rather than a hand-rolled modal/portal: `showModal()` gives
 * focus trapping and top-layer stacking for free, and the browser
 * already closes the dialog (firing `onClose`) on Escape — no keydown
 * listener needed for that specific case, matching this repo's
 * existing preference for native platform behavior over reimplementing
 * it in JS (CSS-only carousel/nav/theme-transition, ThemeToggle 0.c.i.zo
 * being the one prior exception where a real round-trip was
 * unavoidable). Arrow-key prev/next still needs an explicit listener
 * since there's no native affordance for that.
 *
 * Same placeholder-tile convention as ScreenshotCarousel (no real
 * screenshot image assets exist for first-party/dummy entries) — just
 * rendered larger, using the same primary/secondary/tertiary color
 * cycle so the enlarged view matches the thumbnail that was clicked.
 *
 * `3.d.ii.zi` adds the same real-image branch ScreenshotCarousel got:
 * an optional `screenshots` array (parallel to `colors`, one entry per
 * slide) — a real `https://pool.img.aptoide.com/...` URL at the
 * current `index` renders via `next/image` `fill` in `.frame` instead
 * of the colored placeholder. Omitted or a non-real entry falls
 * through to the placeholder exactly as before, so this stays
 * source-compatible with any caller that doesn't pass `screenshots`.
 *
 * Slice 3 of the details page rework (operator-directed 2026-10-08) adds: a horizontal swipe on touch and pen
 * (`swipeStep`, a vertical drag is left alone); the box takes the landscape shape the gallery already saw
 * (`shapes`) and sizes by the viewport's height so a shot is never taller than the screen; the neighbours of the
 * open shot are fetched ahead (hidden `<Image>`s, `neighbourIndexes`) so an arrow press shows a ready image; the
 * close, arrow and counter controls are glass pills with a visible focus ring. Kept: the native `<dialog>` (focus
 * trap, Escape, focus returned to the shot that opened it), arrow keys, click outside to close. Pinch zoom is
 * not built (it needs a gesture layer; recorded in the handover as not done).
 */

export interface LightboxProps {
  appName: string;
  primaryColor: string;
  secondaryColor: string;
  screenshotCount: number;
  colors: string[];
  /** Parallel array to `colors`/screenshot index; a real `https://` URL renders the actual image instead of the placeholder. */
  screenshots?: string[];
  /** Shapes the gallery has seen so far (index to "landscape"); anything absent is portrait. */
  shapes?: Record<number, SlideShape>;
  initialIndex: number;
  onClose: () => void;
}

export default function Lightbox({
  appName,
  primaryColor,
  secondaryColor,
  screenshotCount,
  colors,
  screenshots,
  shapes,
  initialIndex,
  onClose,
}: LightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(initialIndex);

  // Open on mount, close (and notify the parent via onClose, wired to
  // the dialog's native `close` event below) on unmount — e.g. if the
  // parent ever removes this component some other way.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    return () => {
      dialog?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (screenshotCount < 2) return;
      if (event.key === "ArrowRight") {
        setIndex((current) => (current + 1) % screenshotCount);
      } else if (event.key === "ArrowLeft") {
        setIndex((current) => wrapIndex(current - 1, screenshotCount));
      }
    }
    const dialog = dialogRef.current;
    dialog?.addEventListener("keydown", handleKeyDown);
    return () => dialog?.removeEventListener("keydown", handleKeyDown);
  }, [screenshotCount]);

  // Native <dialog> has no built-in "click outside to dismiss" — the
  // backdrop is a pseudo-element, not a click target inside the DOM —
  // so this checks whether the click landed on the <dialog> element
  // itself (i.e. outside the inner .content box) rather than on any
  // child, and closes if so.
  function handleDialogClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      dialogRef.current?.close();
    }
  }

  // Swipe: touch and pen only (a mouse drag selects nothing useful here and the arrows exist). The start point is
  // kept in a ref; a short or mostly vertical move does nothing.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    swipeStart.current = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || screenshotCount < 2) return;
    const step = swipeStep(event.clientX - start.x, event.clientY - start.y);
    if (step === -1) goToNext();
    else if (step === 1) goToPrevious();
  }

  function goToPrevious() {
    setIndex((current) => wrapIndex(current - 1, screenshotCount));
  }

  function goToNext() {
    setIndex((current) => (current + 1) % screenshotCount);
  }

  const color = colors[index % colors.length];
  const textColor = color === primaryColor ? secondaryColor : primaryColor;
  const hasMultiple = screenshotCount > 1;
  const realSrc = screenshots?.[index];
  const landscape = shapes?.[index] === "landscape";
  const shapeClass = landscape ? styles.landscape : "";
  const ahead = neighbourIndexes(index, screenshotCount)
    .map((i) => screenshots?.[i])
    .filter((src): src is string => isRealImageUrl(src));

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onClose={onClose}
      onClick={handleDialogClick}
      aria-label={`${appName} screenshot ${index + 1} of ${screenshotCount}, full size`}
    >
      <div
        className={styles.content}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
      >
        <button
          type="button"
          className={styles.closeButton}
          onClick={() => dialogRef.current?.close()}
          aria-label="Close full-size view"
        >
          ✕
        </button>

        {hasMultiple && (
          <button
            type="button"
            className={`${styles.navButton} ${styles.prevButton}`}
            onClick={goToPrevious}
            aria-label="Previous screenshot"
          >
            ‹
          </button>
        )}

        {isRealImageUrl(realSrc) ? (
          <div className={`${styles.frame} ${shapeClass}`}>
            <Image
              src={realSrc}
              alt={`${appName} — Screenshot ${index + 1}`}
              fill
              unoptimized={!isOptimizableImageUrl(realSrc)}
              sizes={landscape ? "(min-width: 900px) 880px, 92vw" : "(min-width: 768px) 420px, 80vw"}
              style={{ objectFit: "cover" }}
            />
          </div>
        ) : (
          <div
            className={`${styles.placeholder} ${shapeClass}`}
            style={{ backgroundColor: color, color: textColor }}
          >
            <span className={styles.placeholderLabel}>
              {appName} — Screenshot {index + 1}
            </span>
          </div>
        )}

        {hasMultiple && (
          <button
            type="button"
            className={`${styles.navButton} ${styles.nextButton}`}
            onClick={goToNext}
            aria-label="Next screenshot"
          >
            ›
          </button>
        )}

        {ahead.length > 0 && (
          <div className={styles.preload} aria-hidden="true">
            {ahead.map((src) => (
              <Image
                key={src}
                src={src}
                alt=""
                width={16}
                height={16}
                unoptimized={!isOptimizableImageUrl(src)}
                sizes="(min-width: 768px) 420px, 80vw"
                loading="eager"
              />
            ))}
          </div>
        )}

        {hasMultiple && (
          <p className={styles.counter} aria-hidden="true">
            {index + 1} / {screenshotCount}
          </p>
        )}
      </div>
    </dialog>
  );
}
