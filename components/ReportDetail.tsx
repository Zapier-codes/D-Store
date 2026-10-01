import type { ReadReportResult } from "@/lib/report-store";
import ReportDecisionForm from "./ReportDecisionForm";
import styles from "./ReportDetail.module.css";

/**
 * One report in full — leaf `3.c.ix.zo`. A pure server component: it renders
 * what `app/moderation/reports/[id]/page.tsx` hands it and fetches nothing, so
 * every state renders to static markup in a test.
 *
 * `details` is anonymous, attacker-controlled text. It is rendered as a React
 * text child inside a `pre-wrap` paragraph: never as HTML, never turned into a
 * link, never given a title or attribute. An open report gets the decision
 * form; a closed one shows its decision and time and no form.
 */
export interface ReportDetailProps {
  result: ReadReportResult;
  /** The catalog name when the slug resolved; otherwise the bare slug is shown. */
  appName: string | null;
  backHref: string;
}

export default function ReportDetail({ result, appName, backHref }: ReportDetailProps) {
  let body;
  if (!result.ok) {
    const message =
      result.reason === "not_configured"
        ? "The report store is not configured on this deployment, so there is nothing to show."
        : result.reason === "not_found"
          ? "No report with that id exists."
          : "The report store could not be reached. Try again in a moment.";
    body = (
      <p className={styles.notice} role="status" data-state={result.reason}>
        {message}
      </p>
    );
  } else {
    const r = result.report;
    const isOpen = r.status === "open";
    body = (
      <>
        <dl className={styles.facts}>
          <dt>Reason</dt>
          <dd>{r.reason}</dd>
          <dt>App</dt>
          <dd>{r.app_slug === null ? "Legacy report (no app slug)" : appName ? `${appName} (${r.app_slug})` : r.app_slug}</dd>
          <dt>Reported</dt>
          <dd>{r.created_at}</dd>
          <dt>Status</dt>
          <dd>{r.status}</dd>
        </dl>
        <h2 className={styles.subheading}>Details (from the reporter, unverified)</h2>
        {r.details ? (
          <p className={styles.details} data-state="details">
            {r.details}
          </p>
        ) : (
          <p className={styles.notice} data-state="no-details">
            No details were given.
          </p>
        )}
        {isOpen ? (
          <ReportDecisionForm reportId={r.id} />
        ) : (
          <p className={styles.notice} role="status" data-state="closed">
            {r.decision ? `Closed with the decision: ${r.decision}.` : "Closed (no decision recorded)."}
            {r.decided_at ? ` Decided at ${r.decided_at}.` : ""}
          </p>
        )}
      </>
    );
  }

  return (
    <section className={styles.wrapper} aria-labelledby="report-detail-heading">
      <h1 id="report-detail-heading" className={styles.heading}>
        Report
      </h1>
      <p>
        <a className={styles.more} href={backHref}>
          Back to the queue
        </a>
      </p>
      {body}
    </section>
  );
}
