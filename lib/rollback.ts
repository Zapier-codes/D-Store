/**
 * Rollback decision — leaf `5.c.x.zi` (split out of `5.c.iii.zi`).
 *
 * Whether a version-history entry may be offered as a rollback target. Pure:
 * no React, no storage, no clock, no `node:` import, nothing runs at import.
 * It never throws, whatever it is handed, and never mutates its input.
 *
 * "Older" is list position, not a version-string comparison: the index is
 * newest first and `readVersionHistory` never re-sorts it, so position 0 is the
 * release the Install button already offers and is never a rollback target.
 * Every other position defers to `decideDownload` and passes its withheld
 * reason through unchanged, so the rules for `pulled`, `halted`, a rollout
 * still running and a missing link live in one place.
 *
 * `downgrade: true` is a fixed marker on an offer: a rollback is always an
 * older version over a newer one, which the surface (`5.c.xi.zo`) must say
 * plainly. It is data here, not wording.
 */

import { decideDownload, type DownloadWithheldReason, type VersionEntry } from "./version-history";

export type RollbackWithheldReason = DownloadWithheldReason | "newest" | "invalid";

export type RollbackOffer =
  | { offered: true; url: string; downgrade: true }
  | { offered: false; reason: RollbackWithheldReason };

const INVALID: RollbackOffer = { offered: false, reason: "invalid" };

/**
 * @param entries the `entries` of `readVersionHistory`, newest first
 * @param index   the position of the candidate in `entries`
 *
 * `invalid` covers a non-array, a non-integer or out-of-range index, and an
 * entry that is not an object or whose read throws. Checked in that order,
 * then `newest`, then `decideDownload`'s own order.
 */
export function decideRollback(entries: readonly VersionEntry[], index: number): RollbackOffer {
  try {
    if (!Array.isArray(entries)) return INVALID;
    if (typeof index !== "number" || !Number.isInteger(index)) return INVALID;
    if (index < 0 || index >= entries.length) return INVALID;
    const entry = entries[index];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return INVALID;
    if (index === 0) return { offered: false, reason: "newest" };
    const offer = decideDownload(entry);
    if (offer.offered === true && typeof offer.url === "string") {
      return { offered: true, url: offer.url, downgrade: true };
    }
    if (offer.offered === false) return { offered: false, reason: offer.reason };
    return INVALID;
  } catch {
    return INVALID; // a getter or proxy that throws is a malformed entry
  }
}
