"use client";

import { useState } from "react";
import { useInstallStatus } from "@/lib/install-status";
import styles from "./InstallButton.module.css";

/**
 * Install button — leaf 3.a.iv.zi/zo (dummy install + progress-fill),
 * extended by `0.j.i.zo` (Open/Uninstall post-install group), and now
 * layered with device-aware status via `lib/install-status.ts` (same
 * session as `0.j.ii.zi`, at explicit product-owner request — see that
 * module's header comment for exactly what a website can and can't
 * really detect about installed apps, and why this is a device-local
 * simulated record rather than a true OS-level install query).
 *
 * Still click-to-simulate, still no real APK fetch — there is no real
 * download pipeline yet (Phase 5). What's new: the button now checks
 * this device's own `localStorage` record for this app and renders one
 * of three real outcomes instead of always starting from "Install":
 *
 *   - no record for this app here            -> "Install"
 *   - record version === catalog version     -> "Open" / "Uninstall" (0.j.i.zo's group)
 *   - record version <  catalog version      -> "Update" (re-runs the same
 *                                               install animation, then
 *                                               overwrites the record with
 *                                               the current version)
 *
 * So a returning visitor on the same browser/device who already
 * "installed" this app sees that reflected automatically, and a
 * catalog version bump flips a previously up-to-date app over to
 * "Update" on its own — both derived from `useInstallStatus`, not
 * tracked as separate local state here.
 */
const SIMULATED_INSTALL_MS = 1800;

type UiState = "idle" | "installing";

export default function InstallButton({
  appSlug,
  appName,
  currentVersion,
}: {
  appSlug: string;
  appName: string;
  currentVersion: string;
}) {
  const { loaded, status, markInstalled, markUninstalled } = useInstallStatus(
    appSlug,
    currentVersion,
  );
  const [uiState, setUiState] = useState<UiState>("idle");

  function runSimulatedInstall() {
    if (uiState !== "idle") return;
    setUiState("installing");
    // Fire-and-forget — leaf 3.b.i.zi. Only a fresh install bumps the
    // count, not an "Update" re-run of this same simulated flow (real
    // install counters don't increment on update, and `status` here
    // is read before `markInstalled` below changes it). Errors are
    // swallowed deliberately: a failed counter ping must never block
    // or roll back the (dummy, local-only) install itself.
    if (status !== "outdated") {
      fetch(`/api/apps/${appSlug}/install`, { method: "POST" }).catch(() => {});
    }
    setTimeout(() => {
      markInstalled(currentVersion);
      setUiState("idle");
    }, SIMULATED_INSTALL_MS);
  }

  // First client render, before localStorage has been read — a neutral
  // disabled "Checking…" state avoids briefly flashing "Install" for an
  // app this device may already have, then snapping to "Open"/"Update".
  if (!loaded) {
    return (
      <button type="button" className={styles.button} data-state="checking" disabled>
        <span className={styles.label}>Checking&hellip;</span>
      </button>
    );
  }

  if (uiState === "installing") {
    const label = status === "outdated" ? "Updating\u2026" : "Installing\u2026";
    return (
      <button
        type="button"
        className={styles.button}
        data-state="installing"
        disabled
        aria-live="polite"
        aria-label={`${label} ${appName}`}
      >
        <span
          className={styles.fill}
          aria-hidden="true"
          style={{ animationDuration: `${SIMULATED_INSTALL_MS}ms` }}
        />
        <span className={styles.label}>{label}</span>
      </button>
    );
  }

  if (status === "up-to-date") {
    return (
      <span className={styles.group} aria-live="polite">
        <button
          type="button"
          className={styles.button}
          data-state="open"
          aria-label={`Open ${appName}`}
        >
          Open
        </button>
        <button
          type="button"
          className={styles.uninstallButton}
          aria-label={`Uninstall ${appName}`}
          onClick={markUninstalled}
        >
          Uninstall
        </button>
      </span>
    );
  }

  if (status === "outdated") {
    return (
      <span className={styles.group} aria-live="polite">
        <button
          type="button"
          className={styles.button}
          data-state="update"
          aria-label={`Update ${appName}`}
          onClick={runSimulatedInstall}
        >
          Update
        </button>
        <button
          type="button"
          className={styles.uninstallButton}
          aria-label={`Uninstall ${appName}`}
          onClick={markUninstalled}
        >
          Uninstall
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={styles.button}
      data-state="idle"
      aria-live="polite"
      aria-label={`Install ${appName}`}
      onClick={runSimulatedInstall}
    >
      <span className={styles.label}>Install</span>
    </button>
  );
}
