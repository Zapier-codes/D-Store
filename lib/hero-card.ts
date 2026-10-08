/**
 * Pure helpers for the home hero card's extra detail (operator-directed 2026-10-08). No I/O, no React.
 */

/** The first screenshot that is safe to paint as the card's backdrop: a plain https URL, nothing that could break out of a CSS `url("...")`. */
export function pickHeroArt(screenshots: readonly string[] | null | undefined): string | null {
  if (!Array.isArray(screenshots)) return null;
  for (const shot of screenshots) {
    if (typeof shot !== "string") continue;
    if (shot.length === 0 || shot.length > 2000) continue;
    if (!shot.startsWith("https://")) continue;
    if (/[\s"'()\\<>]/.test(shot)) continue;
    return shot;
  }
  return null;
}

/** How much of a five-star meter to fill for an average rating: 0 to 100, one decimal, never outside the range. */
export function ratingFillPercent(average: number | null | undefined): number {
  if (typeof average !== "number" || !Number.isFinite(average) || average <= 0) return 0;
  const pct = Math.min(average, 5) * 20;
  return Math.round(pct * 10) / 10;
}

/** "Updated Oct 2026" from an ISO date, in UTC so the server and the browser agree; null when the date is missing or invalid. */
export function updatedLabel(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const text = new Date(time).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  return `Updated ${text}`;
}
