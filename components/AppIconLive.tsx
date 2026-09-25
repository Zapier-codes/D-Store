"use client";

import AppIcon from "./AppIcon";
import WavyProgressRing from "./WavyProgressRing";
import { useInstallProgress, SIMULATED_INSTALL_MS } from "@/lib/install-status";
import styles from "./AppIconLive.module.css";

/**
 * `AppIcon` wrapped with the circular wavy install-progress ring —
 * leaf 0.j.v.zi. A client component (needs `useInstallProgress`),
 * used anywhere an app's icon sits next to a live `InstallButton`:
 * the app-detail header and `StickyInstallBar`. `AppCard`/`Hero`'s
 * grid/featured icons stay on plain `AppIcon` — nothing there ever
 * triggers an install, so there's nothing to show progress for.
 *
 * `iconUrl` — leaf `3.d.ii.zi` — passed straight through to `AppIcon`,
 * which renders it as a real optimized image when it's a real
 * `https://` URL (third-party/Aptoide apps) and falls back to the
 * generated tile otherwise (first-party dummy apps), same as every
 * other `AppIcon` call site.
 */
export default function AppIconLive({
  appSlug,
  name,
  primaryColor,
  secondaryColor,
  tertiaryColor,
  iconUrl,
  sizes,
}: {
  appSlug: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  iconUrl?: string;
  /** `next/image`'s `sizes` attribute for the two differently-sized call sites (72px header icon, 32px StickyInstallBar icon). */
  sizes?: string;
}) {
  const active = useInstallProgress(appSlug);

  return (
    <div className={styles.wrapper}>
      <AppIcon
        name={name}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        tertiaryColor={tertiaryColor}
        src={iconUrl}
        sizes={sizes ?? "72px"}
      />
      <WavyProgressRing active={active} durationMs={SIMULATED_INSTALL_MS} />
    </div>
  );
}
