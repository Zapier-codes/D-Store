/**
 * Version advisory decision — leaf `5.c.vii.zi` (split out of `5.c.iii.zo`).
 *
 * Zealot's signed index gives every version a lifecycle `status`:
 * `"available"`, `"halted"` or `"pulled"` (Zealot Task 27f-a). This module
 * reads that value safely and decides whether it warrants a banner. Pure: no
 * `node:` or `next` imports, no I/O, nothing runs at import, and nothing here
 * throws, whatever it is handed.
 *
 * This is the release's lifecycle, NOT the staged-rollout ramp
 * (`rollout.status`, `active`/`halted`/`complete`, read by
 * `lib/version-history.ts`). A rollout paused at 30% is not an advisory.
 *
 * The index says nothing about WHY a release was halted or pulled, and has no
 * security-advisory field, so the texts below state the status and give no
 * cause, and never use the words "security" or "vulnerability".
 */

export type VersionStatus = "available" | "halted" | "pulled";

export type AdvisoryKind = "halted" | "pulled";

export interface Advisory {
  kind: AdvisoryKind;
  title: string;
  message: string;
}

/** Longest version name put into a message; the history reader cuts names to the same length. */
export const MAX_ADVISORY_NAME_LENGTH = 64;

/**
 * Anything that is not exactly `"halted"` or `"pulled"` reads as `"available"`:
 * an older cached index has no `status`, and that must read as a normal
 * release, the same posture `5.c.iv.zo` takes for a missing `rollout`. The
 * comparison is exact (no trimming, no case folding) because the index's
 * schema fixes the three values.
 */
export function readVersionStatus(value: unknown): VersionStatus {
  if (value === "halted") return "halted";
  if (value === "pulled") return "pulled";
  return "available";
}

function readName(versionName: unknown): string | null {
  if (typeof versionName !== "string") return null;
  const trimmed = versionName.trim();
  return trimmed === "" ? null : trimmed.slice(0, MAX_ADVISORY_NAME_LENGTH);
}

/**
 * `null` for `"available"` (nothing to say). For `"halted"` and `"pulled"` a
 * title and a message that state the status and no cause. A blank, missing or
 * non-string name falls to wording without one. The status is read through
 * `readVersionStatus`, so a value outside the type is `"available"`, not an
 * error.
 */
export function decideAdvisory(status: VersionStatus, versionName: string | null): Advisory | null {
  const kind = readVersionStatus(status);
  if (kind === "available") return null;

  const name = readName(versionName);
  const subject = name === null ? "the newest version of this app" : `version ${name}`;

  if (kind === "halted") {
    return {
      kind: "halted",
      title: "This version has been paused",
      message: `The publisher has paused ${subject}. Hold off on installing or updating to it until the publisher resumes it.`,
    };
  }
  return {
    kind: "pulled",
    title: "This version has been withdrawn",
    message: `The publisher has withdrawn ${subject}. It should not be installed.`,
  };
}
