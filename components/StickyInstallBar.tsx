"use client";

import { useEffect, useState } from "react";
import DownloadControl from "./installControls";
import AppIcon from "./AppIcon";
import type { App } from "@/lib/catalog";
import styles from "./StickyInstallBar.module.css";

/**
 * Sticky/anchored download action — leaf 0.j.ii.zi (Play Store Parity Pass → Long-listing install accessibility).
 *
 * Play gives long listings a persistent action so the download never scrolls out of reach (HANDOVER.md's `0.j`
 * note, citing the Android Authority Oct 2024 teardown). This app-detail page is exactly that long listing —
 * header, screenshots, description, changelog, ratings, permissions, report form, similar apps — so the header's
 * download control (`#primary-install-row`) is long gone by the time a visitor reaches the bottom sections.
 *
 * Implementation: a plain `IntersectionObserver` (same native-API preference this repo already follows —
 * `ScreenshotCarousel` 0.e.i.zi, `useScrollReveal` 3.a.i.zi) watching the header's install row via its id. The bar
 * only reveals once that row has scrolled *above* the viewport. Reveal/pin transition (slide + fade) is gated
 * behind `@media (prefers-reduced-motion: no-preference)`, so a reduced-motion visitor gets an instant show/hide.
 *
 * Operator-directed 2026-10-10: the bar is a second instance of the one `DownloadControl` (a real download link),
 * so the sticky action never pretends to install. It takes the whole `App` now, so the control resolves the right
 * URL for a first-party or third-party app the same way the header and the card do.
 */
export default function StickyInstallBar({
  app,
  watchTargetId,
}: {
  app: App;
  watchTargetId: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(watchTargetId);
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const scrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        setVisible(scrolledPast);
      },
      { threshold: 0 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [watchTargetId]);

  return (
    <div
      className={styles.bar}
      data-visible={visible}
      aria-hidden={!visible}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      <div className={styles.identity}>
        <div className={styles.icon}>
          <AppIcon
            name={app.name}
            primaryColor={app.primary_color}
            secondaryColor={app.secondary_color}
            tertiaryColor={app.tertiary_color}
            src={app.icon}
            sizes="40px"
          />
        </div>
        <span className={styles.name}>{app.name}</span>
      </div>
      <DownloadControl app={app} />
    </div>
  );
}
