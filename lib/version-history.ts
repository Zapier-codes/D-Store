/**
 * Version-history reader — leaf `5.c.v.zi` (split out of `5.c.ii.zi`).
 *
 * Turns the `versions[]` array of Zealot's signed index into a short, safe
 * list for display. Pure: no `node:` or `next` imports, no I/O, nothing runs
 * at import. It never throws, whatever it is handed.
 *
 * What it deliberately does not carry: a per-version date (the index has one,
 * `released_at`, but showing it is an open operator call) and checksums or
 * signing fingerprints for old versions. It does carry each release's own
 * download URL (`5.c.ii.zo`), and `decideDownload` says whether that URL may be
 * offered. See HANDOVER.md, `5.c.ii.zi`'s and `5.c.ii.zo`'s notes.
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
  /**
   * The release's own download URL from the signed index (`5.c.ii.zo`), or
   * `null` when it is absent or not a plain `https://` URL. Whether it may be
   * *offered* is `decideDownload`'s call, not this field's.
   */
  download_url: string | null;
  permissions: string[];
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
export const MAX_DOWNLOAD_URL_LENGTH = 2048;

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

/**
 * Keeps a download URL only when it is a plain `https://` URL: a literal,
 * case-sensitive prefix (the rule the push endpoint checks use), no
 * whitespace or control characters anywhere (the URL parser would silently
 * strip some of them), no embedded credentials, and at most
 * `MAX_DOWNLOAD_URL_LENGTH` characters. Returns the parser's own `href`, so the
 * value that was checked is the value a browser will follow. No host check:
 * the index is signed, and the newest release's `App.apk` is not host-checked
 * either.
 */
function readDownloadUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text === "" || text.length > MAX_DOWNLOAD_URL_LENGTH) return null;
  if (!text.startsWith("https://") || /[\s\u0000-\u001f\u007f]/.test(text)) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname === "" || url.username !== "" || url.password !== "") return null;
  return url.href;
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
    download_url: readDownloadUrl(item.download_url),
    permissions: Array.isArray(item.compatibility?.permissions) ? item.compatibility.permissions.filter((p: unknown) => typeof p === "string").map((p: string) => p.replace(/^android\.permission\./, "")) : [],
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

/** Why an older version's link is not offered. */
export type DownloadWithheldReason = "pulled" | "halted" | "rolling_out" | "no_link";

export type DownloadOffer = { offered: true; url: string } | { offered: false; reason: DownloadWithheldReason };

/**
 * Whether an older version's download link may be shown (`5.c.ii.zo`). Pure.
 *
 * A link is offered only for a release that is `available` (the publisher has
 * neither halted nor pulled it) **and** fully rolled out (`complete` at 100),
 * so a direct link never bypasses a withdrawal or a staged rollout the
 * publisher is still running. The checks run in that order, so the reason
 * given is the most serious one. This is a recorded default, not a
 * settled product rule: whether the *newest* release's Install button should
 * refuse a `pulled` release is a separate open operator call.
 */
export function decideDownload(entry: VersionEntry): DownloadOffer {
  if (entry.status === "pulled") return { offered: false, reason: "pulled" };
  if (entry.status === "halted") return { offered: false, reason: "halted" };
  if (entry.rollout_status !== "complete" || entry.rollout_percentage < 100) return { offered: false, reason: "rolling_out" };
  if (entry.download_url === null) return { offered: false, reason: "no_link" };
  return { offered: true, url: entry.download_url };
}

export function diffPermissions(newPerms: string[] | undefined, oldPerms: string[] | undefined): string[] {
  if (!Array.isArray(newPerms) || !Array.isArray(oldPerms)) return []; // Unknown if either is missing
  const oldSet = new Set(oldPerms);
  return newPerms.filter(p => !oldSet.has(p));
}
