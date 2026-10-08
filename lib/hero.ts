/**
 * Which apps the home hero carries — operator-directed, 2026-10-08.
 *
 * Pure: no I/O, no React. `app/page.tsx` hands this the Featured list and renders one hero card per
 * result in a horizontally scrolling row.
 *
 * Rules:
 * - Only first-party apps (`origin: "zealot"`) that are flagged featured. A third-party app never
 *   appears in the hero, and there is no fallback to one: if no first-party app is featured the hero
 *   is simply not drawn, and the first-party shelf below leads the page.
 * - At most `HERO_MAX` (10) cards. A featured app beyond the tenth is not dropped from the store: it
 *   still shows in the First-party shelf and in its own category row on the home page.
 * - Order is the caller's order (the signed index's editorial order); a repeated slug keeps its first
 *   position.
 */

import type { App } from "./mock-data";

/** The most cards the hero's scrolling row carries. */
export const HERO_MAX = 10;

export function selectHeroApps(apps: readonly App[] | null | undefined, max: number = HERO_MAX): App[] {
  if (!Array.isArray(apps)) return [];
  const cap = Number.isInteger(max) && max > 0 ? Math.min(max, HERO_MAX) : HERO_MAX;

  const seen = new Set<string>();
  const out: App[] = [];
  for (const app of apps) {
    if (!app || app.origin !== "zealot" || app.is_featured !== true) continue;
    if (seen.has(app.slug)) continue;
    seen.add(app.slug);
    out.push(app);
    if (out.length >= cap) break;
  }
  return out;
}
