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

// --- buildPlan (5.k.x.zo) -------------------------------------------------

/**
 * The most entries (`notify` + `baseline`) one plan may carry — leaf
 * `5.k.x.zo`. **100.** Every entry is a write the caller must make (a
 * baseline row) and, for `notify`, a fan-out to that app's subscribers,
 * all inside one serverless invocation; 100 keeps a run comfortably small
 * while still clearing the first run after deployment (which baselines
 * every subscribed app) in a run or two. Entries over the cap are not
 * dropped: they are counted in `counts.deferred`, get no entry, and — since
 * nothing was recorded for them — classify the same way on the next run.
 * The cap applies to the combined list in slug order, so a run always
 * makes progress (every included entry becomes `unchanged` next run).
 */
export const MAX_PLAN = 100;

export interface PlanNotifyEntry {
  slug: string;
  name: string;
  /** Normalized (trimmed) — exactly the version `classifyApp` compared. */
  version: string;
}

export interface PlanBaselineEntry {
  slug: string;
  /** Normalized (trimmed). */
  version: string;
}

export interface PlanCounts {
  /** Distinct catalog slugs that are subscribed to (after first-wins dedupe). */
  considered: number;
  /** Entries in `notify` (after the cap). */
  notify: number;
  /** Entries in `baseline` (after the cap). */
  baseline: number;
  unchanged: number;
  held_back: number;
  /** `notify`/`baseline` classifications left out by `MAX_PLAN`. */
  deferred: number;
}

export interface DispatchPlan {
  notify: PlanNotifyEntry[];
  baseline: PlanBaselineEntry[];
  counts: PlanCounts;
}

function emptyPlan(): DispatchPlan {
  return {
    notify: [],
    baseline: [],
    counts: { considered: 0, notify: 0, baseline: 0, unchanged: 0, held_back: 0, deferred: 0 },
  };
}

/**
 * Builds the whole-catalog dispatch plan: for every catalog app somebody is
 * subscribed to, what should the next run do. Pure, never throws.
 *
 * - **Only `subscribedSlugs` are considered.** A slug nobody subscribed to
 *   gets no baseline row; a later first subscriber is handled by
 *   `classifyApp`'s no-baseline rule.
 * - **Duplicate slugs: first wins.** They can happen —
 *   `mergeCatalogSources` dedupes on `package_name`, and on slug only for
 *   package-less apps, so two apps with different packages can share a
 *   slug. The first in `apps` order is the one considered; later ones are
 *   ignored (not counted). The result therefore depends on `apps` order
 *   only when slugs collide.
 * - **Sorted by slug** (plain code-unit order, not locale-dependent), so
 *   the same input always gives a byte-identical plan.
 * - **Capped at `MAX_PLAN`** combined `notify` + `baseline` entries; the
 *   rest are counted in `deferred`. `unchanged`/`held_back` produce no
 *   entry, only a count, and are never capped.
 * - `considered = notify + baseline + unchanged + held_back + deferred`.
 * - **Fails safe.** `baselines` must be a `Map`; anything else (or any
 *   error while reading) yields an empty plan, because treating an
 *   unreadable baseline set as "no baselines" would plan a baseline write
 *   for every app and overwrite the real ones. `subscribedSlugs` that is
 *   not iterable is likewise an empty plan (nobody is subscribed).
 *
 * Idempotency: feeding the returned `notify` and `baseline` versions back in
 * as baselines gives an empty plan, apart from anything `deferred`.
 */
export function buildPlan(
  apps: readonly PlanApp[],
  baselines: ReadonlyMap<string, string>,
  subscribedSlugs: Iterable<string>,
): DispatchPlan {
  try {
    if (!(baselines instanceof Map)) return emptyPlan();
    if (subscribedSlugs === null || typeof subscribedSlugs !== "object") return emptyPlan();
    if (!Array.isArray(apps)) return emptyPlan();

    const subscribed = new Set<string>();
    for (const slug of subscribedSlugs) {
      if (typeof slug === "string" && slug.length > 0) subscribed.add(slug);
    }

    // First occurrence of each subscribed slug wins. Each app's fields are
    // read once into a plain snapshot, so what is classified is what is
    // recorded, whatever the input's getters do.
    const chosen = new Map<string, PlanApp>();
    for (const app of apps) {
      if (typeof app !== "object" || app === null) continue;
      let slug: unknown;
      try {
        slug = app.slug;
      } catch {
        continue; // cannot even read the slug: cannot be matched to a subscriber
      }
      if (typeof slug !== "string" || !subscribed.has(slug) || chosen.has(slug)) continue;
      try {
        chosen.set(slug, {
          slug,
          name: app.name,
          version: app.version,
          rollout_percentage: app.rollout_percentage,
          rollout_status: app.rollout_status,
        });
      } catch {
        // A field that throws when read: this one app is `unchanged` (a
        // blank version never classifies as anything else) and still owns
        // its slug; it must not stop the rest of the plan.
        chosen.set(slug, { slug, name: "", version: "", rollout_percentage: 0, rollout_status: "active" });
      }
    }

    const slugs = [...chosen.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    const plan = emptyPlan();
    plan.counts.considered = slugs.length;

    for (const slug of slugs) {
      const app = chosen.get(slug) as PlanApp;
      const decision = classifyApp(app, baselines.get(slug));

      if (decision === "unchanged") {
        plan.counts.unchanged++;
      } else if (decision === "held_back") {
        plan.counts.held_back++;
      } else if (plan.notify.length + plan.baseline.length >= MAX_PLAN) {
        plan.counts.deferred++;
      } else {
        // classifyApp said notify/baseline, so the version is valid.
        const version = normalizeVersion(app.version) as string;
        if (decision === "notify") plan.notify.push({ slug, name: app.name, version });
        else plan.baseline.push({ slug, version });
      }
    }

    plan.counts.notify = plan.notify.length;
    plan.counts.baseline = plan.baseline.length;
    return plan;
  } catch {
    return emptyPlan();
  }
}
