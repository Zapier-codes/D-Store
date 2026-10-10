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

/**
 * One File-by-File update delta Zealot publishes on a version — parity card
 * Z-P13, the data half of the Storeapp client that applies these. This is the
 * `delta_patches[]` entry from the signed index, read conservatively: a patch
 * is kept only when its base version code and its URL are both usable, the same
 * posture `download_url` above already takes. Surfaced, not applied — a website
 * cannot patch or install an APK; the entry only tells a reader that an update
 * to this version can be delivered as a smaller delta when installed from
 * `from_version_code`.
 */
export interface DeltaPatchEntry {
  /** The installed build this patch applies from (Zealot's `from_version_code`). Never empty. */
  from_version_code: string;
  /** Zealot's own delta endpoint, a plain `https://` URL (checked like `download_url`). */
  download_url: string;
  /** Patch size in real bytes, or `null` when the index gave no usable size. */
  size_bytes: number | null;
  /** Lower-case hex SHA-256 of the patch bytes, or `null` when absent/malformed. */
  sha256: string | null;
}

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
  /**
   * The update deltas that reach this version (parity card Z-P13). Empty when
   * the index published none — a first release, an identical pair, a pulled
   * previous build, or a deployment with delta patching off. Additive: an
   * older cached index without the key reads as `[]`, never as an error.
   */
  delta_patches?: DeltaPatchEntry[];
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
/** Most deltas kept per version — a version normally has very few; a hostile array cannot cost unbounded work. */
export const MAX_DELTA_PATCHES = 32;
/** Bounds mirrored from the client (`DeltaApplier.selectPatch`), so display and apply agree on what is usable. */
export const MAX_VERSION_CODE_LENGTH = 64;
/** A SHA-256 is 64 hex characters; anything longer is not one. */
export const MAX_SHA256_LENGTH = 64;

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

/**
 * Per-version permission names, from the index's `compatibility.permissions`
 * (Zealot publishes them there; the list is reserved and empty until Zealot
 * fills it from the APK manifest). Strings only, the `android.permission.`
 * prefix dropped for display. Anything else reads as an empty list, which the
 * permission diff treats as "unknown", never as "no permissions".
 */
function readPermissions(compatibility: unknown): string[] {
  if (!isRecord(compatibility) || !Array.isArray(compatibility.permissions)) return [];
  return compatibility.permissions
    .filter((p: unknown): p is string => typeof p === "string")
    .map((p) => p.replace(/^android\.permission\./, ""));
}

/** A release version code, trimmed and bounded; `null` when absent or empty. */
function readVersionCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim();
  if (code === "" || code.length > MAX_VERSION_CODE_LENGTH) return null;
  return code;
}

/** A lower-case hex SHA-256, or `null`. A mis-cased or colon-separated value is not one. */
function readSha256(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim();
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}

/** Real byte size, or `null` when the index gave none (the patch size, unlike a version's `size_bytes`). */
function readBytes(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/**
 * The `delta_patches[]` a version carries (card Z-P13). A patch is kept only
 * when its base version code and its URL are both usable — the exact pair
 * `DeltaApplier.selectPatch` needs — so the list shown is the list that could
 * actually be applied. Anything else (a patch without a base, a non-https URL)
 * is dropped rather than shown as a dead entry. A non-array reads as empty.
 */
export function readDeltaPatches(value: unknown): DeltaPatchEntry[] {
  if (!Array.isArray(value)) return [];
  const out: DeltaPatchEntry[] = [];
  for (let i = 0; i < value.length && out.length < MAX_DELTA_PATCHES; i++) {
    const item = value[i];
    if (!isRecord(item)) continue;
    const from = readVersionCode(item.from_version_code);
    const url = readDownloadUrl(item.download_url);
    if (from === null || url === null) continue;
    out.push({
      from_version_code: from,
      download_url: url,
      size_bytes: readBytes(item.size),
      sha256: readSha256(item.sha256),
    });
  }
  return out;
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
    permissions: readPermissions(item.compatibility),
    delta_patches: readDeltaPatches(item.delta_patches),
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
  // Unknown if either side is missing OR empty. An empty list is what Zealot publishes for a release
  // whose manifest was never read (every release uploaded before its Task 29c), so it means "unknown",
  // never "no permissions"; treating it as known would flag every permission of the newer version as added.
  if (!Array.isArray(newPerms) || !Array.isArray(oldPerms)) return [];
  if (newPerms.length === 0 || oldPerms.length === 0) return [];
  const oldSet = new Set(oldPerms);
  return newPerms.filter(p => !oldSet.has(p));
}
