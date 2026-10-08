"use client";

import { useId, useState } from "react";
import type { App } from "@/lib/catalog";
import styles from "./Changelog.module.css";

/**
 * "What's New", as a dropdown (the way most app stores show it): only the title and a chevron are
 * visible until the visitor opens it, then the version, date and notes slide open.
 *
 * `App.changelog` is a single release-notes line (no history in the data model), shown with the
 * existing `version` and `updated_at`. The heading is the toggle, so a screen reader hears one
 * "What's New, button, collapsed". Collapsed content is `visibility: hidden`, so it cannot be tabbed
 * to or read until opened. Reduced-motion visitors get no slide.
 */
export default function Changelog({ app }: { app: App }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const formattedDate = new Date(app.updated_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <section className={styles.section} aria-labelledby={`${panelId}-title`}>
      <h2 id={`${panelId}-title`} className={styles.title}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <span>What&rsquo;s New</span>
          <span className={styles.chevron} data-open={open} aria-hidden="true">
            ▾
          </span>
        </button>
      </h2>
      <div className={styles.panel} data-open={open} id={panelId}>
        <div className={styles.panelInner}>
          <div className={styles.wrapper}>
            <div className={styles.meta}>
              <span className={styles.version}>Version {app.version}</span>
              <span className={styles.date}>{formattedDate}</span>
            </div>
            <p className={styles.notes}>{app.changelog}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
