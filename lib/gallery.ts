/**
 * Pure helpers for the details page screenshot gallery and lightbox (operator-directed 2026-10-08, slice 3 of the
 * details page rework). No I/O, no React; the components keep only the DOM and pointer work.
 */

/** Slides the gallery may show: non-empty strings only, order kept. An app with none has no Screenshots section at all. */
export function usableScreenshots(screenshots: readonly unknown[] | null | undefined): string[] {
  if (!Array.isArray(screenshots)) return [];
  return screenshots.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

/** A slide's shape: portrait until the image itself says otherwise (the data carries no dimensions). */
export type SlideShape = "portrait" | "landscape";

export function shapeOf(width: number, height: number): SlideShape | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return width > height ? "landscape" : "portrait";
}

/** The slide whose left edge is nearest the scroll position; `offsets` are each slide's `offsetLeft`. */
export function nearestSlideIndex(offsets: readonly number[], scrollLeft: number): number {
  if (offsets.length === 0 || !Number.isFinite(scrollLeft)) return 0;
  let best = 0;
  let bestDistance = Infinity;
  offsets.forEach((offset, i) => {
    const d = Math.abs(offset - scrollLeft);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return best;
}

/** Wrap an index into 0..count-1 (lightbox arrows loop). */
export function wrapIndex(index: number, count: number): number {
  if (!Number.isInteger(count) || count <= 0) return 0;
  return ((index % count) + count) % count;
}

/**
 * A horizontal swipe: -1 (finger moved left, show the next shot), 1 (moved right, show the previous), or 0 when the
 * move was too short, or mostly vertical (a scroll, not a swipe).
 */
export function swipeStep(dx: number, dy: number, minDistance = 48): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  if (Math.abs(dx) < minDistance) return 0;
  if (Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? -1 : 1;
}

/** The neighbours of `index` (previous and next, wrapping) to preload in the lightbox; empty for fewer than two slides. */
export function neighbourIndexes(index: number, count: number): number[] {
  if (count < 2) return [];
  const out = [wrapIndex(index - 1, count), wrapIndex(index + 1, count)];
  return out.filter((v, i) => v !== index && out.indexOf(v) === i);
}

/** A screenshot URL that is safe to paint as a blurred CSS backdrop: plain https, nothing that can break out of `url()`. */
export function ambientArtFor(src: string | null | undefined): string | null {
  if (typeof src !== "string" || src.length === 0 || src.length > 2000) return null;
  if (!src.startsWith("https://")) return null;
  if (/[\s"'()\\<>]/.test(src)) return null;
  return src;
}
