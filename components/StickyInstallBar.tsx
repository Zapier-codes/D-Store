"use client";

import { useEffect, useState } from "react";
import InstallButton from "./InstallButton";
import ThirdPartyDownloadButton from "./ThirdPartyDownloadButton";
import AppIconLive from "./AppIconLive";
import styles from "./StickyInstallBar.module.css";

/**
 * Sticky/anchored install action — leaf 0.j.ii.zi (Play Store Parity
 * Pass → Long-listing install accessibility).
 *
 * Play gives long listings a persistent install affordance so the
 * action never scrolls out of reach (HANDOVER.md's `0.j` note, citing
 * the Android Authority Oct 2024 teardown). This app-detail page
 * (`app/app/[slug]/page.tsx`) is exactly that long listing — header,
 * screenshots, description, changelog, ratings, verification,
 * disclosures, permissions, report form, similar apps — so the
 * *header's* Install/Open/Update control (`#primary-install-row`) is
 * long gone by the time a visitor reaches the bottom sections.
 *
 * Implementation: a plain `IntersectionObserver` (same native-API
 * preference this repo already follows — `ScreenshotCarousel`
 * 0.e.i.zi, `useScrollReveal` 3.a.i.zi) watching the header's install
 * row via its id. The bar only reveals once that row has scrolled
 * *above* the viewport (the user scrolled down past it) — not before
 * it's ever entered the viewport on first paint, and not while it's
 * merely below the fold pre-scroll. Renders its own `InstallButton`
 * instance for the same `appSlug`; `lib/install-status.ts`'s
 * same-tab change event keeps it in sync with the header's instance
 * without lifting state into a shared parent.
 *
 * Reveal/pin transition (slide + fade) is gated behind
 * `@media (prefers-reduced-motion: no-preference)` in the CSS module,
 * same convention every other animated leaf in this repo already
 * follows (ScrollReveal 3.a.i.zi, the hero mount animation 0.d.i.zo,
 * press states 3.a.ii.zi, the install-button fill 3.a.iv.zo) — a
 * reduced-motion visitor gets an instant show/hide instead.
 */
export default function StickyInstallBar({
  appSlug,
  appName,
  currentVersion,
  primaryColor,
  secondaryColor,
  tertiaryColor,
  watchTargetId,
  thirdParty,
}: {
  appSlug: string;
  appName: string;
  currentVersion: string;
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  watchTargetId: string;
  /** 5.h.iii.zi — when set, render the real download link instead of the simulated install button. */
  thirdParty?: { downloadUrl: string; sourceName: string };
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
          <AppIconLive
            appSlug={appSlug}
            name={appName}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            tertiaryColor={tertiaryColor}
          />
        </div>
        <span className={styles.name}>{appName}</span>
      </div>
      {thirdParty ? (
        <ThirdPartyDownloadButton
          appSlug={appSlug}
          appName={appName}
          downloadUrl={thirdParty.downloadUrl}
          sourceName={thirdParty.sourceName}
        />
      ) : (
        <InstallButton appSlug={appSlug} appName={appName} currentVersion={currentVersion} />
      )}
    </div>
  );
}
