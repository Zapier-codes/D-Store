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

/**
 * Anonymous "Report app" form — leaf 0.f.iii.zi (App Detail Page →
 * Moderation), closing out `0.f` (Trust & Safety UI). Per
 * docs/D-STORE.md §5.F/§7: "Anonymous 'Report app' flow (broken link,
 * malware concern)" backed by a future `ReportFlag` (anonymous app
 * reports) entity — "No accounts means lightweight, not review-thread
 * moderation," which is why this is a single reason + optional detail
 * field, not a threaded discussion.
 *
 * Per HANDOVER.md 0.f.iii.zi: "dummy submit — logs locally, no
 * backend." There is no `ReportFlag` API yet (that's the Phase 5
 * entity docs/D-STORE.md §7 names), so submitting only
 * `console.log`s the report payload and flips local `submitted` state
 * for a confirmation message — same anonymous/no-identity-check,
 * local-state-only shape as `RateThisApp` (0.e.iii.zo), and for the
 * same reason: nothing here should fake a real moderation-queue write.
 * `2.b.iii.zo` (the admin review queue for these reports) is real
 * backend work and explicitly NOT superseded by this leaf — see the
 * note on the `2.b` track heading.
 */
export default function ReportAppForm({ appSlug }: { appSlug: string }) {
  const [reason, setReason] = useState<(typeof REASONS)[number] | "">("");
  const [details, setDetails] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.confirmation} role="status">
          Thanks — your report has been noted.
        </p>
      </div>
    );
  }

  return (
    <form
      className={styles.wrapper}
      onSubmit={(event) => {
        event.preventDefault();
        if (!reason) return;
        // Dummy submit — no ReportFlag backend exists yet (Phase 5).
        console.log("[ReportAppForm] dummy report submitted", {
          appSlug,
          reason,
          details,
        });
        setSubmitted(true);
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

      <button type="submit" className={styles.submit} disabled={!reason}>
        Submit report
      </button>
    </form>
  );
}
