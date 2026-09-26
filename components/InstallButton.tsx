"use client";

import { useState } from "react";
import { useInstallStatus, setInstallProgressActive, SIMULATED_INSTALL_MS } from "@/lib/install-status";
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
 * The button now checks this device's own `localStorage` record for
 * this app and renders one of three real outcomes instead of always
 * starting from "Install":
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
 *
 * `5.g.ii.zi` — real download, resolved directly to the Console's
 * contract, no D-Store-hosted copy: `apkUrl` is `App.apk`, which
 * `lib/sources/zealot.ts` already carries straight through from the
 * signed catalog index's per-version `download_url` (`5.g.i.zi`) — the
 * stable URL the Console (Zealot) itself serves the finished, signed
 * APK from. This click now genuinely fetches that URL (a transient,
 * never-rendered `<a>`, clicked programmatically and removed — same
 * "no persistent link in the DOM" shape a Play Store web Install button
 * has, unlike `ThirdPartyDownloadButton`'s honestly-a-link-to-another-
 * site treatment for Aptoide apps) rather than doing nothing network-
 * side, which is what made the rest of this flow a pure timer before
 * this leaf. `apkUrl === ""` means the Console has no release attached
 * yet — same "nothing honest to link to" case `ThirdPartyDownloadButton`
 * already disables for, so this renders the same disabled treatment
 * rather than ever faking a successful install with no file behind it.
 *
 * What's still simulated, honestly, and why: there is still no browser
 * API that can report "the fetch above finished / the file is actually
 * on disk / the APK is actually installed" (see this module's own
 * `lib/install-status.ts` header for the general reason a website can't
 * query real OS-level install state), so the progress fill/ring and the
 * flip to "Open" are still timed by `SIMULATED_INSTALL_MS`, not driven
 * by the real download's actual byte progress — the click is now real,
 * the completion signal is not yet. Byte-accurate progress (streaming
 * the response, driving the fill from real `content-length` bytes) is a
 * bigger, separately-scoped change (new state plumbing through
 * `lib/install-status.ts`'s shared progress event into both the button
 * fill and `WavyProgressRing`) and is flagged forward rather than
 * bundled into this leaf's stated scope.
 */

type UiState = "idle" | "installing";

export default function InstallButton({
  appSlug,
  appName,
  currentVersion,
  apkUrl,
}: {
  appSlug: string;
  appName: string;
  currentVersion: string;
  /** 5.g.ii.zi — stable download URL from the Console's signed index (`App.apk`); "" when no release is attached yet. */
  apkUrl: string;
}) {
  const { loaded, status, markInstalled, markUninstalled } = useInstallStatus(
    appSlug,
    currentVersion,
  );
  const [uiState, setUiState] = useState<UiState>("idle");

  function runSimulatedInstall() {
    if (uiState !== "idle") return;
    setUiState("installing");
    // 0.j.v.zi — flips the shared cross-component progress flag so the
    // app-icon's WavyProgressRing overlay (header + StickyInstallBar)
    // starts its sweep in lockstep with this same button click, even
    // though the icon lives in a separate element/component tree.
    setInstallProgressActive(appSlug, true);
    // Fire-and-forget — leaf 3.b.i.zi. Only a fresh install bumps the
    // count, not an "Update" re-run of this same simulated flow (real
    // install counters don't increment on update, and `status` here
    // is read before `markInstalled` below changes it). Errors are
    // swallowed deliberately: a failed counter ping must never block
    // or roll back the (dummy, local-only) install itself.
    if (status !== "outdated") {
      fetch(`/api/apps/${appSlug}/install`, { method: "POST" }).catch(() => {});
    }
    // 5.g.ii.zi — the actual download: a transient anchor to the real
    // Console-served URL, clicked once and discarded. Never appended
    // visibly, never `target="_blank"` (an APK response isn't
    // renderable, so browsers download it in place with no navigation
    // and no blank tab) — this is what makes the click resolve to the
    // stable contract URL for real, instead of only running a timer.
    const link = document.createElement("a");
    link.href = apkUrl;
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => {
      markInstalled(currentVersion);
      setInstallProgressActive(appSlug, false);
      setUiState("idle");
    }, SIMULATED_INSTALL_MS);
  }

  // 5.g.ii.zi — no release attached in the Console's signed index yet:
  // same "nothing honest to link to" case `ThirdPartyDownloadButton`
  // already disables for, rather than ever faking a successful install
  // with no file behind it. Checked before `!loaded` below: `apkUrl` is
  // a plain prop (not a `localStorage` read), so it's identical on the
  // server and first client render — no hydration-mismatch risk, no
  // "checking…" state needed for this branch.
  if (!apkUrl) {
    return (
      <button type="button" className={styles.button} data-state="unavailable" disabled>
        Install unavailable
      </button>
    );
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
