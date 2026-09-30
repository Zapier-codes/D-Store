/**
 * Version-history reader — leaf `5.c.v.zi` (split out of `5.c.ii.zi`).
 *
 * Turns the `versions[]` array of Zealot's signed index into a short, safe
 * list for display. Pure: no `node:` or `next` imports, no I/O, nothing runs
 * at import. It never throws, whatever it is handed.
 *
 * What it deliberately does not carry: a per-version date (the index has none;
 * `updated_at` is the app's, not the version's), download links and checksums
 * for old versions (`5.c.ii.zo`, Held). See HANDOVER.md, `5.c.ii.zi`'s note.
 */

import { readVersionStatus, type VersionStatus } from "./version-advisory";

export type VersionRolloutStatus = "active" | "halted" | "complete";

export interface VersionEntry {
  version_name: string;
  /** Trimmed release notes, or `null` when the index had none. */
  changelog: string | null;
  /** Megabytes to one decimal, or `null` when the index gave no usable size. */
  size_mb: number | null;
  /** 0-100; 100 = fully available. */
  rollout_percentage: number;
  rollout_status: VersionRolloutStatus;
  /**
   * The release's lifecycle status (`5.c.vii.zo`): `"available"`, `"halted"` or
   * `"pulled"`. Not the rollout ramp above. An entry with no or an unknown
   * `status` (an older cached index) is `"available"`.
   */
  status: VersionStatus;
}

export interface VersionHistory {
  /** Newest first: the index's own order, never re-sorted. At most `MAX_VERSION_HISTORY`. */
  entries: VersionEntry[];
  /**
   * How many input items are not in `entries`: malformed ones, ones past the
   * cap, and ones past the scan limit. `entries.length + omitted` is the
   * length of the input array (0 for a non-array).
   */
  omitted: number;
}

/** Most entries kept. A long-lived app can have hundreds of releases; a page needs the recent ones. */
export const MAX_VERSION_HISTORY = 50;
/** Most input items looked at, so a hostile or huge array cannot cost unbounded work. */
export const MAX_VERSIONS_SCANNED = 1000;
export const MAX_VERSION_NAME_LENGTH = 64;
export const MAX_CHANGELOG_LENGTH = 2000;

const STATUSES: readonly VersionRolloutStatus[] = ["active", "halted", "complete"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSizeMb(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const mb = Math.round((value / (1024 * 1024)) * 10) / 10;
  return mb > 0 ? mb : null; // under 0.05 MB rounds to 0: unknown, not "0 MB"
}

/**
 * An absent or non-object `rollout` is fully available (`100`/`complete`), the
 * same reading `5.c.iv.zo` gives an older cached index. Inside an object, an
 * unusable percentage is `100`, and an unknown status is `complete` at 100 and
 * `active` below it. The percentage is clamped to 0-100.
 */
function readRollout(value: unknown): Pick<VersionEntry, "rollout_percentage" | "rollout_status"> {
  if (!isRecord(value)) return { rollout_percentage: 100, rollout_status: "complete" };
  const rawPct = value.percentage;
  const pct = typeof rawPct === "number" && Number.isFinite(rawPct) ? Math.min(100, Math.max(0, rawPct)) : 100;
  const rawStatus = value.status;
  const status = STATUSES.find((s) => s === rawStatus) ?? (pct >= 100 ? "complete" : "active");
  return { rollout_percentage: pct, rollout_status: status };
}

function readEntry(item: unknown): VersionEntry | null {
  if (!isRecord(item)) return null;
  const name = typeof item.version_name === "string" ? item.version_name.trim() : "";
  if (name === "") return null;
  const notes = typeof item.changelog === "string" ? item.changelog.trim() : "";
  return {
    version_name: name.slice(0, MAX_VERSION_NAME_LENGTH),
    changelog: notes === "" ? null : notes.slice(0, MAX_CHANGELOG_LENGTH),
    size_mb: readSizeMb(item.size_bytes),
    ...readRollout(item.rollout),
    status: readVersionStatus(item.status),
  };
}

export function readVersionHistory(versions: unknown): VersionHistory {
  if (!Array.isArray(versions)) return { entries: [], omitted: 0 };
  const total = versions.length;
  const scan = Math.min(total, MAX_VERSIONS_SCANNED);
  const entries: VersionEntry[] = [];
  for (let i = 0; i < scan && entries.length < MAX_VERSION_HISTORY; i++) {
    try {
      const entry = readEntry(versions[i]);
      if (entry) entries.push(entry);
    } catch {
      // a getter or proxy that throws is a malformed entry, not a failure
    }
  }
  return { entries, omitted: total - entries.length };
}
