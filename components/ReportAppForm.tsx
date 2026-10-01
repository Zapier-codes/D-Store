"use client";

import { useState } from "react";
import styles from "./ReportAppForm.module.css";

const REASONS = [
  "Broken download link",
  "Malware or security concern",
  "Inappropriate content",
  "Copyright / DMCA issue",
  "Other",
] as const;

export type ReportOutcome = { kind: "done" } | { kind: "error"; message: string };

/**
 * Maps the intake route's HTTP status to what the visitor is told. Only `200`
 * is success; every other status is a plain error that never claims the
 * report was saved. Statuses are from `lib/report-intake.ts` and the shared
 * limiter (`429`).
 */
export function describeReportStatus(status: number): ReportOutcome {
  if (status === 200) return { kind: "done" };
  if (status === 429) return { kind: "error", message: "Too many reports from this connection. Please try again later." };
  if (status === 404) return { kind: "error", message: "This app could not be found, so the report was not sent." };
  if (status === 400 || status === 413) return { kind: "error", message: "The report was not accepted. Check the reason and keep the details shorter, then try again." };
  if (status === 503) return { kind: "error", message: "Reporting is not available right now. Your report was not sent." };
  if (status === 502) return { kind: "error", message: "The report could not be saved. Please try again in a moment." };
  return { kind: "error", message: "The report could not be sent. Please try again in a moment." };
}

/**
 * Anonymous "Report app" form — leaf 0.f.iii.zi, wired to the real intake
 * route by leaf `3.c.x.zi`. It `POST`s `{ reason, details }` to
 * `/api/apps/<slug>/reports` and shows the real outcome: the confirmation
 * appears only on `200`; `429`, `404`, `400`, `413`, `503`, `502` and a
 * network error each show a plain message and leave the form filled in so
 * the visitor can retry. The button is disabled while a request is in flight.
 * Nothing identifying is added to the request (no cookie logic, no client id;
 * only the reason and the details the visitor typed).
 *
 * Ships only once migrations `20261001010000` and `20261001020000` are applied
 * to the Supabase project; until then the route answers `502`/`503` and the
 * visitor sees that, not a false confirmation.
 */
export default function ReportAppForm({ appSlug }: { appSlug: string }) {
  const [reason, setReason] = useState<(typeof REASONS)[number] | "">("");
  const [details, setDetails] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (submitted) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.confirmation} role="status">
          Thanks — your report has been sent.
        </p>
      </div>
    );
  }

  return (
    <form
      className={styles.wrapper}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!reason || sending) return;
        setSending(true);
        setError(null);
        try {
          const res = await fetch(`/api/apps/${encodeURIComponent(appSlug)}/reports`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason, details }),
          });
          const outcome = describeReportStatus(res.status);
          if (outcome.kind === "done") setSubmitted(true);
          else setError(outcome.message);
        } catch {
          setError("The report could not be sent. Check your connection and try again.");
        } finally {
          setSending(false);
        }
      }}
    >
      <label className={styles.label} htmlFor="report-reason">
        Report this app
      </label>

      <select
        id="report-reason"
        className={styles.select}
        value={reason}
        onChange={(event) => setReason(event.target.value as (typeof REASONS)[number])}
        required
      >
        <option value="" disabled>
          Select a reason&hellip;
        </option>
        {REASONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <textarea
        className={styles.textarea}
        placeholder="Additional details (optional)"
        value={details}
        onChange={(event) => setDetails(event.target.value)}
        rows={3}
      />

      <button type="submit" className={styles.submit} disabled={!reason || sending}>
        {sending ? "Sending\u2026" : "Submit report"}
      </button>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
