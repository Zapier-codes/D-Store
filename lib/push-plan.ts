/**
 * Web Push dispatch plan — leaf `5.k.x.zi`, first of the two `5.k.x`
 * leaves (split out of `5.k.iii.zi`). Pure functions: no I/O, no new
 * dependency, no imports, and nothing here runs at import time. Nothing
 * here throws, whatever it is handed. `buildPlan` (`5.k.x.zo`) is built
 * on top of `classifyApp` in this same file; the dispatch route
 * (`5.k.xiii.zi`) is built on that.
 *
 * `classifyApp` answers one question about one app: given the version
 * the catalog says is live now and the last version this app's
 * subscribers were told about, what should the next dispatch run do?
 *
 * The app is described by a structural subset, `PlanApp`, on purpose:
 * this module does not import `lib/mock-data.ts`, so the plan can be
 * tested with plain objects and does not move when `App` grows fields.
 *
 * ## Three decisions, recorded here so the code and the reasons stay together
 *
 * 1. **Rollout.** The server cannot know which staged-rollout bucket a
 *    device is in — `lib/rollout.ts` is per-device and runs in the
 *    browser — so it cannot tell a device "there is an update" without
 *    risking telling one that is outside the bucket and cannot install
 *    it yet. So a version is notified only when it is fully out:
 *    `rollout_status === "complete"` **and** `rollout_percentage === 100`.
 *    Anything else (active, halted, or a percentage that disagrees with
 *    the status) is `held_back`, and a held-back app leaves its baseline
 *    untouched, so it is looked at again on the next run and notified
 *    once it completes. Both conditions are required because they are
 *    two separate fields that could disagree; when they do, silence is
 *    the safe answer.
 *
 * 2. **No baseline.** An app with no recorded last-notified version has
 *    never been seen by the dispatcher, and its current version is not
 *    news — the subscriber saved the app knowing what was live. So it is
 *    `baseline`: record the current version, send nothing. This is also
 *    what stops the first run after deployment from notifying every
 *    subscriber about every app at once. The same rule covers an app
 *    that gains its first subscriber later.
 *
 * 3. **Version comparison.** Versions are free-form strings (`1.2.3`,
 *    `2024.06`, `r41`, `v1.0-beta`) and no ordering can be assumed, so
 *    two versions are compared as trimmed strings for equality only.
 *    Any difference notifies. **Consequence, flagged, not fixed:** a
 *    rollback to an older version differs from the recorded one, so it
 *    notifies too, and `1.10` versus `1.1` are different. Case matters.
 *    A future leaf that wants "only newer" needs a versioning scheme the
 *    catalog does not have today.
 *
 * ## Decisions about bad input
 *
 * A malformed app (not an object, `slug` or `name` not strings, `slug`
 * empty, `version` not a string or empty after trimming) is `unchanged`:
 * the one classification that causes no side effect — no notification and
 * no baseline row. A malformed baseline (neither a string, nor
 * `undefined`/`null`) is `unchanged` for the same reason; guessing that it
 * means "absent" would overwrite whatever the store actually holds. A
 * `null` or blank baseline *is* treated as absent, because a nullable
 * `push_notified_version` column is the likely source of both.
 *
 * ## Known consequence of decision 1 and 2 together
 *
 * An app with no baseline is `held_back` while its live version is still
 * rolling out or halted, not `baseline`: recording an unfinished version
 * as the baseline would make it `unchanged` the moment it completes, and
 * it would never notify. The cost is that a subscriber who saved an app
 * during a rollout is not told when that rollout completes, because the
 * completed version is then baselined silently. That is the same "you
 * saved it knowing what was live" rule applied at the first moment the
 * dispatcher can be sure of what is live.
 */

/** What `classifyApp` needs to know about an app — a subset of the catalog's `App`. */
export interface PlanApp {
  slug: string;
  name: string;
  version: string;
  rollout_percentage: number;
  rollout_status: "active" | "halted" | "complete";
}

/**
 * What the next dispatch run should do for one app.
 *
 * - `notify`    — tell subscribers, then record the version.
 * - `baseline`  — record the version, tell nobody.
 * - `unchanged` — do nothing.
 * - `held_back` — do nothing and record nothing; look again next run.
 */
export type Classification = "notify" | "baseline" | "unchanged" | "held_back";

/**
 * A version as it will be compared and stored: a string, trimmed, and not
 * empty. `null` for anything else. `buildPlan` uses this too, so the
 * version it puts in the plan is exactly the one `classifyApp` compared.
 */
export function normalizeVersion(input: unknown): string | null {
  try {
    if (typeof input !== "string") return null;
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/** The one state in which a version is fully out: both fields agree it is complete. */
function isFullyRolledOut(status: unknown, percentage: unknown): boolean {
  return status === "complete" && percentage === 100;
}

/**
 * Classifies one app against its last-notified version. See the header
 * for the three decisions and the bad-input rules. Never throws.
 *
 * Order of the checks matters:
 *
 * - With no baseline, rollout is checked first, so an unfinished version
 *   is never recorded as the baseline (it would then never notify).
 * - With a baseline, equality is checked first, so an app whose version
 *   has not moved is `unchanged` however its rollout fields read, rather
 *   than `held_back` (which would say "a new version is waiting").
 */
export function classifyApp(app: PlanApp, baselineVersion: string | undefined): Classification {
  try {
    if (typeof app !== "object" || app === null) return "unchanged";

    // Each field is read exactly once, so a getter cannot answer differently
    // the second time.
    const slug: unknown = app.slug;
    const name: unknown = app.name;
    const rawVersion: unknown = app.version;
    const percentage: unknown = app.rollout_percentage;
    const status: unknown = app.rollout_status;
    const rawBaseline: unknown = baselineVersion;

    if (typeof slug !== "string" || slug.length === 0) return "unchanged";
    if (typeof name !== "string") return "unchanged";
    const version = normalizeVersion(rawVersion);
    if (version === null) return "unchanged";

    let baseline: string | null;
    if (rawBaseline === undefined || rawBaseline === null) {
      baseline = null;
    } else if (typeof rawBaseline === "string") {
      baseline = normalizeVersion(rawBaseline); // blank counts as absent
    } else {
      return "unchanged"; // present but not a string: refuse to guess
    }

    const fullyOut = isFullyRolledOut(status, percentage);

    if (baseline === null) return fullyOut ? "baseline" : "held_back";
    if (version === baseline) return "unchanged";
    return fullyOut ? "notify" : "held_back";
  } catch {
    return "unchanged";
  }
}
