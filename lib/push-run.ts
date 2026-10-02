/**
 * Web Push run orchestrator — leaf `5.k.xvii.zi`.
 *
 * One call to `runPush(catalog)` does a whole sending run:
 *
 *   1. read the dispatch state (`readDispatchState`: subscribed slugs and
 *      recorded baselines) and build the plan (`buildPlan`);
 *   2. read the recipients of the `notify` slugs (`readRecipients`);
 *   3. fan out (`buildFanout`) into one message per (device, app);
 *   4. send with bounded concurrency inside a time budget (`sendPush`);
 *   5. prune endpoints the push service reported `gone` (`deleteSubscription`);
 *   6. record baselines (`writeNotifiedVersions`) for the `baseline` entries
 *      and for the `notify` entries that qualify.
 *
 * The catalog is passed in, not read here: `getDispatchCatalog()` is bound to
 * the current request (tenant resolution), so the route owns it
 * (`5.k.xvii.zo`). This module does no request handling.
 *
 * Pure orchestration: every dependency is injectable (`RunDeps`), nothing
 * runs at import, and `runPush` never throws.
 *
 * ---------------------------------------------------------------------
 * Decisions recorded
 * ---------------------------------------------------------------------
 *
 * (1) Transient send failures (finding (d) of `5.k.iii.zo`): a `notify`
 *     entry's baseline is HELD BACK — not recorded — when any message for
 *     its slug failed retryably (`5xx`, `429`, network, timeout, an
 *     unexpected throw) or was never attempted because the time budget ran
 *     out. The next run plans it again and retries. A device that was
 *     already told gets a second push, which the per-slug `Topic` replaces
 *     at the push service. A repeated notification is chosen over a missed
 *     one.
 *
 * (2) Non-retryable per-device failures (`endpoint_not_allowed`,
 *     `invalid_recipient`, `invalid_message`, `unsendable`, `rejected`,
 *     `redirect_refused`): counted, NOT held back and NOT pruned. Retrying
 *     cannot help, and holding the slug back would stall every other
 *     subscriber of the app forever. The row is left alone (this module
 *     only prunes what the push service says is `gone`), so the same
 *     failure shows up again in the next run's counts.
 *
 * (3) `gone` (`404`/`410`) is the only result that prunes. A gone device is
 *     not a failure for the slug: there is nobody left to retry.
 *
 * (4) `not_configured` and `vapid_mismatch` stop the whole run: every device
 *     would fail the same way. Nothing is recorded, not even baselines, and
 *     the result is `ok: false, reason: "sender_not_configured"`.
 *
 * (5) A failed or partial read of the state or the recipients stops the run
 *     before anything is sent, and nothing is recorded. Baseline entries are
 *     also not written in that case: they are only ever an optimisation of
 *     the next run, and a run that could not read what it needed reports
 *     failure rather than a half result.
 *
 * (6) Slugs that lost a message to the per-device cap (`capped_slugs`) are
 *     held back like a transient failure, so the next run sends the rest.
 *
 * (7) Anything the fan-out reports as skipped (`notify_skipped`,
 *     `devices_skipped`) is an anomaly (the plan and the recipients read
 *     both validate already). It cannot be attributed to a slug, so ALL
 *     `notify` baselines are held back for that run; `baseline` entries are
 *     still written.
 *
 * (8) A `notify` slug with no message at all (nobody left subscribed by the
 *     time recipients were read) qualifies: there was nobody to tell.
 *
 * (9) Time budget: `PUSH_RUN_BUDGET_MS` covers the whole run, measured from
 *     the first line of `runPush`. No new send starts when the time left is
 *     less than one send's worst case (`PUSH_SEND_DEADLINE_MS`) plus
 *     `PUSH_RUN_RESERVE_MS` (kept for pruning and the baseline write), so
 *     in-flight sends finish inside the budget. Unstarted messages hold
 *     their slug back (1). Pruning stops when the budget is spent; endpoints
 *     not pruned are simply reported `gone` again next run. The route's
 *     platform function limit must be at least this budget (`5.k.xvii.zo`).
 *
 * (10) Baseline write failing (`unavailable`, possibly partial) does not
 *     undo the sends: the run is still `ok: true` with
 *     `baseline_write: "failed"`. The consequence is at worst one repeated
 *     notification next run (see `writeNotifiedVersions`).
 *
 * (11) Result is counts only. Nothing here logs, and nothing returned names
 *     an endpoint, a key, a slug or a version.
 */

import type { PlanApp, DispatchPlan, PlanBaselineEntry } from "./push-plan";
import { buildPlan } from "./push-plan";
import { buildFanout, type PushMessage } from "./push-fanout";
import { PUSH_SEND_DEADLINE_MS, sendPush, type SendResult } from "./push-send";
import {
  deleteSubscription,
  readDispatchState,
  readRecipients,
  writeNotifiedVersions,
  type DispatchStateResult,
  type NotifiedVersionEntry,
  type PushRecipient,
  type PushStoreResult,
  type RecipientsResult,
  type WriteNotifiedResult,
} from "./push-store";

/** Whole-run time budget in milliseconds. See decision (9). */
export const PUSH_RUN_BUDGET_MS = 40_000;

/** Time kept back for pruning and the baseline write. See decision (9). */
export const PUSH_RUN_RESERVE_MS = 8_000;

/** Sends in flight at once. */
export const PUSH_RUN_CONCURRENCY = 8;

export interface RunDeps {
  readState?: () => Promise<DispatchStateResult>;
  readRecipients?: (slugs: string[]) => Promise<RecipientsResult>;
  send?: (recipient: PushRecipient, message: PushMessage) => Promise<SendResult>;
  prune?: (endpoint: string) => Promise<PushStoreResult>;
  write?: (entries: NotifiedVersionEntry[]) => Promise<WriteNotifiedResult>;
  /** Milliseconds clock; tests inject a fake. */
  now?: () => number;
  budgetMs?: number;
  reserveMs?: number;
  sendDeadlineMs?: number;
  concurrency?: number;
}

export interface RunCounts {
  /** Entries in the plan's `notify` list. */
  notify: number;
  /** Entries in the plan's `baseline` list. */
  baseline: number;
  /** Classifications the plan left out (`MAX_PLAN`); run again when above zero. */
  deferred: number;
  /** Messages built by the fan-out. */
  messages: number;
  /** Messages a send was started for. */
  attempted: number;
  sent: number;
  gone: number;
  /** Failed with `retryable: true`, or threw. */
  failed_retryable: number;
  /** Failed with `retryable: false`. */
  failed_permanent: number;
  /** Messages never attempted: the time budget ran out. */
  unsent: number;
  /** Messages the per-device cap left out. */
  capped: number;
  /** Endpoints deleted. */
  pruned: number;
  /** Gone endpoints not deleted (delete failed, or the budget was spent). */
  prune_failed: number;
  /** `notify` slugs whose baseline was held back. */
  held_back: number;
  /** Baseline rows handed to the store (the store's own count when it answered). */
  recorded: number;
}

export type RunFailureReason =
  | "not_configured"
  | "unavailable"
  | "sender_not_configured"
  | "unexpected";

export type RunResult =
  | {
      ok: true;
      counts: RunCounts;
      /** `true` when the time budget stopped new sends before the queue was empty. */
      stopped_early: boolean;
      /** `true` when the fan-out reported skipped entries or devices; see decision (7). */
      anomaly: boolean;
      /** `none` when there was nothing to write. */
      baseline_write: "ok" | "failed" | "none";
    }
  | { ok: false; reason: RunFailureReason };

function emptyCounts(): RunCounts {
  return {
    notify: 0,
    baseline: 0,
    deferred: 0,
    messages: 0,
    attempted: 0,
    sent: 0,
    gone: 0,
    failed_retryable: 0,
    failed_permanent: 0,
    unsent: 0,
    capped: 0,
    pruned: 0,
    prune_failed: 0,
    held_back: 0,
    recorded: 0,
  };
}

function positiveInt(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

function nonNegative(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Runs one sending pass over `catalog` (the value `getDispatchCatalog()`
 * returns, or a loader `(subscribedSlugs) => catalog` that reads only those apps, leaf `5.l.xv.zo`). Never throws; see the file header for every decision.
 */
export async function runPush(
  catalog: readonly PlanApp[] | ((subscribedSlugs: string[]) => Promise<readonly PlanApp[]>),
  deps: RunDeps = {},
): Promise<RunResult> {
  try {
    const clock = deps.now ?? Date.now;
    const started = clock();
    const budgetMs = nonNegative(deps.budgetMs, PUSH_RUN_BUDGET_MS);
    const reserveMs = nonNegative(deps.reserveMs, PUSH_RUN_RESERVE_MS);
    const sendDeadlineMs = nonNegative(deps.sendDeadlineMs, PUSH_SEND_DEADLINE_MS);
    const concurrency = positiveInt(deps.concurrency, PUSH_RUN_CONCURRENCY);

    const doReadState = deps.readState ?? (() => readDispatchState());
    const doReadRecipients = deps.readRecipients ?? ((slugs: string[]) => readRecipients(slugs));
    const doSend =
      deps.send ?? ((recipient: PushRecipient, message: PushMessage) => sendPush(recipient, message));
    const doPrune = deps.prune ?? ((endpoint: string) => deleteSubscription(endpoint));
    const doWrite = deps.write ?? ((entries: NotifiedVersionEntry[]) => writeNotifiedVersions(entries));

    // 1. State and plan. A failed read is never planned against.
    const state = await doReadState();
    if (!state.ok) {
      return { ok: false, reason: state.reason === "not_configured" ? "not_configured" : "unavailable" };
    }
    // 5.l.xv.zo — a loader receives the subscribed slugs, so the route can read only those apps. A loader that
    // throws (a catalog read failure) is `unavailable`: nothing is planned, sent or recorded.
    let apps: readonly PlanApp[];
    if (typeof catalog === "function") {
      try {
        apps = await catalog(state.subscribedSlugs);
      } catch {
        return { ok: false, reason: "unavailable" };
      }
    } else {
      apps = catalog;
    }
    const plan: DispatchPlan = buildPlan(apps, state.baselines, state.subscribedSlugs);

    const counts = emptyCounts();
    counts.notify = plan.notify.length;
    counts.baseline = plan.baseline.length;
    counts.deferred = plan.counts.deferred;

    // 2-3. Recipients and fan-out, only when there is something to notify.
    let messages: PushMessage[] = [];
    let devices: PushRecipient[] = [];
    let cappedSlugs = new Set<string>();
    let anomaly = false;

    if (plan.notify.length > 0) {
      const recipients = await doReadRecipients(plan.notify.map((entry) => entry.slug));
      if (!recipients.ok) {
        return { ok: false, reason: recipients.reason === "not_configured" ? "not_configured" : "unavailable" };
      }
      devices = recipients.devices;

      const fanout = buildFanout(plan.notify, devices);
      if (!fanout.ok) return { ok: false, reason: "unavailable" };

      messages = fanout.messages;
      cappedSlugs = new Set(fanout.capped_slugs);
      counts.messages = messages.length;
      counts.capped = fanout.counts.capped;
      anomaly = fanout.counts.notify_skipped > 0 || fanout.counts.devices_skipped > 0;
    }

    // 4. Send with bounded concurrency inside the budget.
    const attempted: boolean[] = new Array(messages.length).fill(false);
    const heldSlugs = new Set<string>(cappedSlugs);
    const goneDevices = new Set<number>();
    let next = 0;
    let stopped = false;
    let senderStopped = false;
    let stoppedEarly = false;

    const worker = async (): Promise<void> => {
      for (;;) {
        if (senderStopped) return;
        if (clock() - started + sendDeadlineMs + reserveMs > budgetMs) {
          stoppedEarly = true;
          return;
        }
        const index = next++;
        if (index >= messages.length) return;
        attempted[index] = true;
        counts.attempted += 1;

        const message = messages[index];
        const device = devices[message.deviceIndex];
        if (device === undefined) {
          counts.failed_permanent += 1;
          continue;
        }

        let result: SendResult;
        try {
          result = await doSend(device, message);
        } catch {
          counts.failed_retryable += 1;
          heldSlugs.add(message.slug);
          continue;
        }

        if (result.status === "sent") {
          counts.sent += 1;
        } else if (result.status === "gone") {
          counts.gone += 1;
          goneDevices.add(message.deviceIndex);
        } else if (result.status === "not_configured") {
          senderStopped = true;
          stopped = true;
          return;
        } else if (result.reason === "vapid_mismatch") {
          senderStopped = true;
          stopped = true;
          return;
        } else if (result.retryable) {
          counts.failed_retryable += 1;
          heldSlugs.add(message.slug);
        } else {
          counts.failed_permanent += 1;
        }
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(concurrency, Math.max(messages.length, 1)); i += 1) {
      workers.push(worker());
    }
    await Promise.all(workers);

    // Decision (4): nothing was sent that could be recorded; record nothing.
    if (stopped) return { ok: false, reason: "sender_not_configured" };

    for (let i = 0; i < messages.length; i += 1) {
      if (!attempted[i]) {
        counts.unsent += 1;
        heldSlugs.add(messages[i].slug);
      }
    }

    // 5. Prune gone endpoints, only while the budget lasts.
    for (const deviceIndex of goneDevices) {
      if (clock() - started + reserveMs > budgetMs) {
        counts.prune_failed += 1;
        continue;
      }
      const endpoint = devices[deviceIndex]?.endpoint;
      if (typeof endpoint !== "string") {
        counts.prune_failed += 1;
        continue;
      }
      let pruned: PushStoreResult;
      try {
        pruned = await doPrune(endpoint);
      } catch {
        pruned = { ok: false, reason: "unavailable" };
      }
      if (pruned.ok) counts.pruned += 1;
      else counts.prune_failed += 1;
    }

    // 6. Baselines: every `baseline` entry, plus the `notify` entries that qualify.
    const entries: NotifiedVersionEntry[] = plan.baseline.map((entry: PlanBaselineEntry) => ({
      slug: entry.slug,
      version: entry.version,
    }));
    for (const entry of plan.notify) {
      if (anomaly || heldSlugs.has(entry.slug)) {
        counts.held_back += 1;
        continue;
      }
      entries.push({ slug: entry.slug, version: entry.version });
    }

    let baselineWrite: "ok" | "failed" | "none" = "none";
    if (entries.length > 0) {
      let written: WriteNotifiedResult;
      try {
        written = await doWrite(entries);
      } catch {
        written = { ok: false, reason: "unavailable" };
      }
      if (written.ok) {
        baselineWrite = "ok";
        counts.recorded = written.written;
      } else {
        baselineWrite = "failed";
      }
    }

    return { ok: true, counts, stopped_early: stoppedEarly, anomaly, baseline_write: baselineWrite };
  } catch {
    return { ok: false, reason: "unexpected" };
  }
}
