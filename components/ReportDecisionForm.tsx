"use client";

import { useState } from "react";
import type { ReportDecision } from "@/lib/report-store";
import styles from "./ReportDecisionForm.module.css";

/**
 * Decision form for one open report — leaf `3.c.ix.zo`. A client component:
 * it `POST`s `{ decision }` to `/api/moderation/reports/<id>/decision`
 * (`3.c.viii.zo`) with `credentials: "same-origin"`, so the browser's own
 * Basic credentials for `/moderation` go with it. It never claims success
 * unless the route answered `200`.
 *
 * The four values are repeated here, as a type-checked list, because this file
 * must not import `lib/report-store.ts` at runtime (that module pulls in
 * `node:crypto`); `ReportDecision` is imported as a type only, so a value
 * added there fails to compile here until it gets a label.
 */
export const DECISION_OPTIONS: ReadonlyArray<{ value: ReportDecision; label: string; help: string }> = [
  { value: "no_action", label: "No action", help: "The report does not need a change." },
  { value: "relabel", label: "Relabel", help: "Correct a wrong label or a missing disclosure." },
  { value: "remove", label: "Remove", help: "The listing should come out of the catalog." },
  { value: "escalate", label: "Escalate", help: "Hand it to the publisher, or into the /dmca process." },
];

export type DecisionOutcome =
  | { kind: "done" }
  | { kind: "already_closed" }
  | { kind: "error"; message: string };

/** Maps the route's HTTP status to what the moderator is told. Only `200` is success. */
export function describeDecisionStatus(status: number): DecisionOutcome {
  if (status === 200) return { kind: "done" };
  if (status === 409) return { kind: "already_closed" };
  if (status === 400) return { kind: "error", message: "That decision was not accepted. Reload the page and try again." };
  if (status === 401 || status === 403) return { kind: "error", message: "Your sign-in was not accepted. Reload the page and sign in again." };
  if (status === 404) return { kind: "error", message: "This report no longer exists." };
  if (status === 503) return { kind: "error", message: "The report store is not configured on this deployment. Nothing was recorded." };
  if (status === 502) return { kind: "error", message: "The report store could not be reached. The decision may not have been recorded; reload to check." };
  return { kind: "error", message: "The decision could not be recorded. Reload the page to check." };
}

export default function ReportDecisionForm({ reportId }: { reportId: string }) {
  const [decision, setDecision] = useState<ReportDecision | "">("");
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<DecisionOutcome | null>(null);

  if (outcome?.kind === "done") {
    return (
      <p className={styles.notice} role="status" data-state="done">
        Decision recorded. Reload the page to see the closed report.
      </p>
    );
  }

  return (
    <form
      className={styles.form}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!decision || sending) return;
        setSending(true);
        setOutcome(null);
        try {
          const res = await fetch(`/api/moderation/reports/${encodeURIComponent(reportId)}/decision`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision }),
          });
          setOutcome(describeDecisionStatus(res.status));
        } catch {
          setOutcome({ kind: "error", message: "The request did not reach the server. Nothing is known to be recorded; reload to check." });
        } finally {
          setSending(false);
        }
      }}
    >
      <fieldset className={styles.fieldset} disabled={sending}>
        <legend className={styles.legend}>Decision</legend>
        {DECISION_OPTIONS.map((o) => (
          <label key={o.value} className={styles.option}>
            <input type="radio" name="decision" value={o.value} checked={decision === o.value} onChange={() => setDecision(o.value)} />
            <span>
              <span className={styles.optionLabel}>{o.label}</span>
              <span className={styles.optionHelp}>{o.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <button className={styles.button} type="submit" disabled={!decision || sending}>
        {sending ? "Recording…" : "Close report"}
      </button>
      {outcome?.kind === "already_closed" ? (
        <p className={styles.notice} role="status" data-state="already_closed">
          Someone else decided this report first, and their decision stands. Reload the page to see it.
        </p>
      ) : null}
      {outcome?.kind === "error" ? (
        <p className={styles.notice} role="alert" data-state="error">
          {outcome.message}
        </p>
      ) : null}
    </form>
  );
}
