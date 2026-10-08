import type { App } from "./mock-data";
import { formatFactDate } from "./app-facts";

/**
 * Pure helpers behind the details page's About block and What's New card (operator-directed 2026-10-08, slice 5
 * of the rework in docs/DETAIL-PAGE-REWORK-PROMPT.md, section 5D). No I/O, no React.
 *
 * The rule is the same as for the stat strip and the Information list: a block exists only when the source gave
 * text for it. Nothing is invented, and an empty string or the placeholder "Not provided" counts as missing, so
 * no empty heading and no "Not provided" line is ever drawn.
 */

/** Collapse the description once it is longer than this many characters (a heuristic, as it was before). */
export const ABOUT_COLLAPSE_THRESHOLD = 220;

export type DescriptionBlock = { kind: "paragraph"; text: string } | { kind: "list"; items: string[] };

/** Text the source left empty or marked as missing; `null` when there is nothing to show. */
export function usableDescription(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0) return null;
  if (text.toLowerCase() === "not provided") return null;
  return text;
}

/** True when the description is long enough to plausibly overflow the collapsed view. */
export function canCollapseDescription(description: string): boolean {
  return description.length > ABOUT_COLLAPSE_THRESHOLD;
}

/**
 * Splits a description into paragraphs and bullet lists. Blocks are separated by a blank line; a block whose
 * every line starts with "- " is a list (the way F-Droid's own description is written), anything else is a
 * paragraph that keeps its text as given.
 */
export function descriptionBlocks(description: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  for (const block of description.split("\n\n")) {
    const lines = block.split("\n").filter(Boolean);
    if (lines.length === 0) continue;
    const isList = lines.every((line) => line.trim().startsWith("- "));
    if (isList) {
      blocks.push({ kind: "list", items: lines.map((line) => line.trim().replace(/^- /, "")) });
    } else {
      blocks.push({ kind: "paragraph", text: block });
    }
  }
  return blocks;
}

export interface WhatsNew {
  version: string | null;
  /** "Oct 8, 2026" (UTC), or `null` when the app has no usable update date. */
  date: string | null;
  notes: string;
}

/**
 * What the What's New card shows: the release notes, with the version and the update date when the source gave
 * them. `null` (no card at all) when there are no notes.
 */
export function whatsNewFor(app: Pick<App, "changelog" | "version" | "updated_at">): WhatsNew | null {
  const notes = usableDescription(app.changelog);
  if (!notes) return null;
  return {
    version: usableDescription(app.version),
    date: formatFactDate(app.updated_at),
    notes,
  };
}
