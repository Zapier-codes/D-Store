"use client";

import { isHttpsUrl } from "@/lib/download";
import styles from "./InstallButton.module.css";

/**
 * Download control for first-party apps — operator-directed 2026-10-10 (website = Download and Share only).
 *
 * This replaces the old simulated install button (a timer-driven "Installing…" fill, a device-local
 * install record that flipped the control to Open/Update/Uninstall, the wavy progress ring, and
 * Android `intent:` open links). None of that is true on a website: the browser can only download a
 * file, and the visitor installs it themselves. So this is one honest action — it points at the
 * store's own download door (`appDownloadUrl`) and the browser saves the APK. There is no progress
 * animation and no post-click state, because a browser cannot report real download byte progress or
 * whether the file was installed.
 *
 * The click fires this store's own install counter (fire-and-forget, `keepalive` so it survives the
 * download the click starts); a failed ping never blocks the download. `downloadUrl === ""` means
 * there is nothing honest to link to (no release attached, or a pulled release) — a disabled button,
 * never a dead link.
 */
export default function InstallButton({
  appSlug,
  appName,
  downloadUrl,
}: {
  appSlug: string;
  appName: string;
  /** Absolute https URL (third-party source) or a same-origin store path (`appDownloadUrl`); "" disables the control. */
  downloadUrl: string;
}) {
  if (!downloadUrl) {
    return (
      <button type="button" className={styles.button} data-state="unavailable" disabled>
        Download unavailable
      </button>
    );
  }

  // An external source URL opens in a new tab; the store's own door downloads in place.
  const external = isHttpsUrl(downloadUrl);

  return (
    <a
      href={downloadUrl}
      className={styles.button}
      aria-label={`Download ${appName}`}
      {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : { download: "" })}
      onClick={() => {
        fetch(`/api/apps/${appSlug}/install`, { method: "POST", keepalive: true }).catch(() => {});
      }}
    >
      Download
    </a>
  );
}
