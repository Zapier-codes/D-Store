"use client";

import { useId, useState } from "react";
import ReportAppForm from "./ReportAppForm";
import styles from "./ReportProblem.module.css";

/**
 * "Report a problem" as a quiet footer action (operator-directed 2026-10-08, slice 5 of the details page rework,
 * brief section 5H). One muted line with a small flag; tapping it opens the existing `ReportAppForm` in place,
 * under the line. It must not compete with the install action, so it has no heading, no panel and no accent
 * until it is hovered or focused.
 *
 * The form (and what it sends, `POST /api/apps/<slug>/reports`) is untouched. It stays mounted while folded
 * (`hidden`), so a half-typed report survives closing and reopening; opening moves focus to its first field.
 */
export default function ReportProblem({ appSlug }: { appSlug: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      // Wait one frame so the form is visible before it takes focus (a hidden element cannot be focused).
      requestAnimationFrame(() => document.getElementById("report-reason")?.focus());
    }
  }

  return (
    <section className={styles.root} aria-label="Report a problem">
      <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
        </svg>
        Report a problem
      </button>
      <div id={panelId} className={styles.panel} hidden={!open}>
        <ReportAppForm appSlug={appSlug} />
      </div>
    </section>
  );
}
