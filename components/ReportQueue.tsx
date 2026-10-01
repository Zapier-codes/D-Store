import type { ReadReportsResult, ReportStatusFilter } from "@/lib/report-store";
import styles from "./ReportQueue.module.css";

/**
 * Report queue list — leaf `3.c.ix.zi`. A pure server component: it renders
 * what `app/moderation/reports/page.tsx` hands it and fetches nothing, so every
 * state can be rendered to static markup in a test.
 *
 * Never shows a report's `details` (the list does not even fetch it). Text from
 * the store is rendered as text by React, never as HTML. `appNames` maps a
 * catalog slug to its name when the catalog resolved it; a slug that did not
 * resolve (or a catalog failure) shows the bare slug, never an error.
 */
export interface ReportQueueProps {
  status: ReportStatusFilter;
  result: ReadReportsResult;
  appNames: Record<string, string>;
  /** Epoch milliseconds "now", passed in so the age text is deterministic. */
  now: number;
  /** Link to the next page, or null on the last page. */
  nextHref: string | null;
  /** Link that switches between the open and closed lists. */
  switchHref: string;
}

/** "5 minutes ago". Coarse on purpose; an unparseable or future time reads "just now". */
export function formatAge(createdAt: string, now: number): string {
  const then = Date.parse(createdAt);
  if (!Number.isFinite(then)) return "unknown age";
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const units: Array<[string, number]> = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [name, size] of units) {
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      return `${n} ${name}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

export default function ReportQueue({ status, result, appNames, now, nextHref, switchHref }: ReportQueueProps) {
  const title = status === "open" ? "Open reports" : "Closed reports";
  const switchLabel = status === "open" ? "Show closed reports" : "Show open reports";

  let body;
  if (!result.ok) {
    const message =
      result.reason === "not_configured"
        ? "The report store is not configured on this deployment, so there is nothing to show."
        : result.reason === "invalid_input"
          ? "That page of reports could not be requested."
          : "The report store could not be reached. Try again in a moment.";
    body = (
      <p className={styles.notice} role="status" data-state={result.reason}>
        {message}
      </p>
    );
  } else if (result.reports.length === 0) {
    body = (
      <p className={styles.notice} role="status" data-state="empty">
        {status === "open" ? "No open reports." : "No closed reports."}
      </p>
    );
  } else {
    body = (
      <>
        <ul className={styles.list}>
          {result.reports.map((r) => {
            const name = r.app_slug !== null ? appNames[r.app_slug] : undefined;
            return (
              <li key={r.id} className={styles.item}>
                <a className={styles.link} href={`/moderation/reports/${encodeURIComponent(r.id)}`}>
                  <span className={styles.reason}>{r.reason}</span>
                  <span className={styles.app}>
                    {r.app_slug === null ? "Legacy report (no app slug)" : name ? `${name} (${r.app_slug})` : r.app_slug}
                  </span>
                  <span className={styles.meta}>
                    {formatAge(r.created_at, now)}
                    {status === "closed" && r.decision ? ` · decision: ${r.decision}` : ""}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
        {nextHref ? (
          <p>
            <a className={styles.more} href={nextHref}>
              Older reports
            </a>
          </p>
        ) : null}
      </>
    );
  }

  return (
    <section className={styles.wrapper} aria-labelledby="report-queue-heading">
      <h1 id="report-queue-heading" className={styles.heading}>
        {title}
      </h1>
      <p>
        <a className={styles.more} href={switchHref}>
          {switchLabel}
        </a>
      </p>
      {body}
    </section>
  );
}
