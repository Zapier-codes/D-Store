"use client";

import { useId, useState } from "react";
import type { App } from "@/lib/catalog";
import { whatsNewFor } from "@/lib/about-text";
import { GlassPill, PillRow } from "./glass";
import styles from "./Changelog.module.css";

/**
 * "What's New", as a dropdown (the way most app stores show it): only the title and a chevron are visible until
 * the visitor opens it, then a glass card slides open with the version and date as pills and the release notes.
 * Restyled by operator-directed 2026-10-08 (slice 5 of the details page rework, brief section 5D); the dropdown
 * itself is unchanged, the operator asked for it.
 *
 * `App.changelog` is a single release-notes line (no history in the data model), shown with the existing
 * `version` and `updated_at` (`whatsNewFor`, lib/about-text.ts). A pill exists only when its value does, and the
 * whole section renders nothing when the source gave no notes (no heading left behind). The heading is the
 * toggle, so a screen reader hears one "What's New, button, collapsed". Collapsed content is
 * `visibility: hidden`, so it cannot be tabbed to or read until opened. Reduced-motion visitors get no slide.
 */
export default function Changelog({ app }: { app: App }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const news = whatsNewFor(app);
  if (!news) return null;

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
            {(news.version || news.date) && (
              <PillRow>
                {news.version && <GlassPill variant="accent">Version {news.version}</GlassPill>}
                {news.date && <GlassPill>Updated {news.date}</GlassPill>}
              </PillRow>
            )}
            <p className={styles.notes}>{news.notes}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
