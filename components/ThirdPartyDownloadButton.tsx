"use client";

import styles from "./ThirdPartyDownloadButton.module.css";

/**
 * Download control for third-party apps — leaf `5.h.iii.zi`.
 *
 * Deliberately not `InstallButton`: that component simulates an install
 * (`lib/install-status.ts` keeps a device-local record and animates a
 * progress fill) because first-party apps have no real download
 * pipeline yet. A third-party app already has a real file, hosted by
 * its source, so this is an honest link to it — no fake "Installing…",
 * and no "Open"/"Uninstall" state, since a browser can't know whether
 * the visitor actually installed what they downloaded.
 *
 * The click still pings this store's own install counter (`3.b.i.zi`,
 * "app-native counters"), fire-and-forget like `InstallButton`: a
 * failed ping must never block the download. `keepalive` lets the
 * request survive the navigation the link triggers.
 *
 * `downloadUrl` is `""` when the source response had no usable https
 * path (see `aptoideDownloadUrl`); that renders a disabled button, not
 * a dead link.
 */
export default function ThirdPartyDownloadButton({
  appSlug,
  appName,
  downloadUrl,
  sourceName,
}: {
  appSlug: string;
  appName: string;
  downloadUrl: string;
  sourceName: string;
}) {
  if (!downloadUrl) {
    return (
      <button type="button" className={styles.button} data-state="unavailable" disabled>
        Download unavailable
      </button>
    );
  }

  return (
    <a
      href={downloadUrl}
      className={styles.button}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={`Download ${appName} from ${sourceName}`}
      onClick={() => {
        fetch(`/api/apps/${appSlug}/install`, { method: "POST", keepalive: true }).catch(() => {});
      }}
    >
      Download
    </a>
  );
}
