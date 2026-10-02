/**
 * Dynamic category colours — operator-directed fix (no leaf).
 *
 * Every category tile gets its own hue, derived from `(appType, slug)` so the
 * same category is always the same colour (server and client agree, no flash,
 * no data field needed). Pure, no imports. The tile CSS turns the hue into
 * theme-aware lightness (see CategoryCard.module.css), so the glyph/background
 * pair stays readable in both dark and light mode.
 */

/** FNV-1a 32-bit hash of a string. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Golden-angle step: neighbouring hash values land far apart on the wheel. */
const GOLDEN_ANGLE = 137.508;

/** A stable hue in [0, 360) for a category. */
export function categoryHue(appType: string | undefined, slug: string): number {
  const h = hash(`${appType ?? "app"}:${slug}`);
  return Math.round(((h % 3600) / 10 + (h % 7) * GOLDEN_ANGLE) % 360);
}
