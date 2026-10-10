"use client";

/**
 * Local view history — leaf `4.d.ii.zo`, second of the two `4.d.ii`
 * (Recommendations) leaves. `4.d.ii.zi`'s "For You" row could only draw
 * on favorites (`lib/favorites.ts`) because no browsing-history signal
 * existed yet — that leaf's own doc comment flagged this exact gap
 * ("4.d.ii.zo... is where a richer signal, e.g. view history, gets
 * folded in, once one exists"). This is that signal.
 *
 * Same "anonymous, per-device, no accounts" posture as everything else
 * in `4.d`: a plain `localStorage` record, not IndexedDB — unlike
 * favorites (an unbounded collection a visitor deliberately curates
 * over a long time), view history is a short, self-pruning recency
 * window (`MAX_ENTRIES` below), which is exactly the "single small
 * record" shape `localStorage` is right-sized for.
 *
 * Stores `{ slug, category, viewedAt }`, not a full `App` — same "the
 * local record is a lightweight pointer, not a data cache" split
 * `FavoriteRecord` already established — but the personalization signal
 * this leaf needs is purely the *category*, so that's captured directly
 * rather than re-resolving every entry against the catalog just to read
 * one field back out later.
 *
 * Re-viewing an already-recorded app moves it to the front with a fresh
 * timestamp rather than adding a duplicate entry — a history of *distinct
 * recently-viewed apps*, not a raw event log, so one app opened five
 * times today can't crowd out four other apps actually looked at. Same
 * fail-soft posture as `lib/favorites.ts`: any storage error resolves
 * to a safe empty default rather than throwing, so a browsing-history
 * write/read failure never blocks rendering.
 */

import { affinityCategory } from "./taxonomy";

export interface ViewHistoryEntry {
  slug: string;
  category: string;
  viewedAt: string; // ISO date
}

const STORAGE_KEY = "d-store:view-history";
// A bounded recency window, not a full log — old entries age out so a
// visitor's category affinity reflects recent interest, not everything
// they've ever opened. 30 distinct apps comfortably covers "the last
// several sessions" of browsing without growing unbounded.
const MAX_ENTRIES = 30;

function readHistory(): ViewHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ViewHistoryEntry =>
        typeof entry?.slug === "string" && typeof entry?.category === "string" && typeof entry?.viewedAt === "string"
    );
  } catch {
    return [];
  }
}

function writeHistory(entries: ViewHistoryEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort only — same fail-soft posture as the rest of this module.
  }
}

/**
 * Records a detail-page view. Called from `ViewHistoryRecorder` on
 * mount, same "fire on mount, not on a user action" timing `ViewPing`
 * (the separate server-side aggregate counter, `3.b.i.zo`) already
 * uses for a "view" — this is a different store for a different
 * purpose (per-device personalization signal vs. sitewide public
 * counter), not a duplicate of it.
 */
export function recordView(app: { slug: string; category: string }): void {
  const existing = readHistory().filter((entry) => entry.slug !== app.slug);
  const updated: ViewHistoryEntry = {
    slug: app.slug,
    category: app.category,
    viewedAt: new Date().toISOString(),
  };
  // Most-recent first, capped to MAX_ENTRIES — the oldest entries are
  // what age out, not the newest.
  writeHistory([updated, ...existing].slice(0, MAX_ENTRIES));
}

/** Every recorded view, most-recent first. Empty on any failure. */
export function listViewHistory(): ViewHistoryEntry[] {
  return readHistory().sort((a, b) => b.viewedAt.localeCompare(a.viewedAt));
}

/**
 * The categories this visitor viewed, most-recent first, as Play-vocabulary
 * slugs — leaf `5.i.vi.zi`. Entries are stored as whatever slug the app
 * carried when it was viewed (a legacy slug such as `internet` for anything
 * recorded before the taxonomy moved), and that stored format is deliberately
 * unchanged; the translation happens here, on read, through
 * `affinityCategory`, so an old entry and a new one for the same interest
 * agree. An entry whose category is not one we know is dropped, not turned
 * into a guess. Empty on any storage failure.
 */
export function listViewedCategories(): string[] {
  const result: string[] = [];
  for (const entry of listViewHistory()) {
    const category = affinityCategory(entry.category);
    if (category !== null) result.push(category);
  }
  return result;
}
