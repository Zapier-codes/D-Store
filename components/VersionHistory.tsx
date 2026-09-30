import type { App } from "@/lib/catalog";
import { isNotProvided } from "@/lib/trust";
import { decideDownload, type DownloadWithheldReason, type VersionEntry } from "@/lib/version-history";
import styles from "./VersionHistory.module.css";

/**
 * Version history list — leaf `5.c.vi.zi` (split out of `5.c.ii.zi`).
 *
 * Pure server component: no state, no client code. Takes an `App` and shows
 * `app.version_history` (newest first, the index's own order) with each
 * entry's version name, size, rollout state and changelog.
 *
 * Three states, decided from the data and never guessed:
 *  - `isNotProvided(app, "version_history")` — the source has no version list
 *    (third-party apps): an honest "Not provided" line, not an empty list.
 *  - a first-party app whose index was read but carried no usable versions:
 *    an empty state.
 *  - entries: the list, plus a line when `version_history_omitted` is above 0.
 *
 * `5.c.ii.zo` — direct download links for older versions. Every entry after
 * the first gets either a link or a one-line reason there is none, decided by
 * `decideDownload` (a link only for a release that is neither halted nor
 * pulled and is fully rolled out). The first entry is the newest release: it
 * is offered by the Install button and covered by the advisory banner, so it
 * gets neither a link nor a reason here. No checksum or signing fingerprint is
 * shown for an older version.
 *
 * Deliberately absent: a per-version date (the index carries `released_at`,
 * but whether to show it is an open operator call). Rollout state is written
 * out as text so it never depends on colour alone.
 *
 * Shell classes are copied from `Changelog`/`DataSafety` rather than adding
 * a third variant.
 */

const WITHHELD_TEXT: Record<DownloadWithheldReason, string> = {
  pulled: "The publisher has withdrawn this version, so it is not offered for download.",
  halted: "The publisher has paused this version, so it is not offered for download.",
  rolling_out: "This version is still rolling out, so it is not offered for download.",
  no_link: "No download link is provided for this version.",
};

function rolloutText(entry: VersionEntry): string {
  if (entry.rollout_status === "halted") return `Rollout paused at ${entry.rollout_percentage}%`;
  if (entry.rollout_status === "active") return `Rolling out to ${entry.rollout_percentage}%`;
  return "Fully available";
}

export default function VersionHistory({ app }: { app: App }) {
  if (isNotProvided(app, "version_history")) {
    return (
      <div className={styles.wrapper}>
        <span className={styles.label}>Version history</span>
        <p className={styles.empty}>
          Not provided by source &mdash; this app&rsquo;s listing has no version history.
        </p>
      </div>
    );
  }

  const entries = app.version_history ?? [];
  const omitted =
    typeof app.version_history_omitted === "number" && app.version_history_omitted > 0
      ? Math.floor(app.version_history_omitted)
      : 0;

  if (entries.length === 0) {
    return (
      <div className={styles.wrapper}>
        <span className={styles.label}>Version history</span>
        <p className={styles.empty}>No earlier versions have been published yet.</p>
      </div>
    );
  }

  // Index 0 is the newest release: the Install button offers it, so it gets no link here.
  const offers = entries.map((entry, index) => (index === 0 ? null : decideDownload(entry)));
  const anyLink = offers.some((offer) => offer !== null && offer.offered);

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Version history</span>
      <ol className={styles.list}>
        {entries.map((entry, index) => {
          const offer = offers[index];
          return (
            // `release_id` may repeat or be missing, so the position is part of the key.
            <li key={`${index}-${entry.version_name}`} className={styles.item}>
              <div className={styles.meta}>
                <span className={styles.version}>Version {entry.version_name}</span>
                {entry.size_mb !== null && <span className={styles.detail}>{entry.size_mb} MB</span>}
                <span className={styles.detail}>{rolloutText(entry)}</span>
              </div>
              <p className={styles.notes}>{entry.changelog ?? "No changelog provided."}</p>
              {offer !== null &&
                (offer.offered ? (
                  <a className={styles.download} href={offer.url} rel="noopener noreferrer">
                    Download version {entry.version_name}
                  </a>
                ) : (
                  <p className={styles.withheld}>{WITHHELD_TEXT[offer.reason]}</p>
                ))}
            </li>
          );
        })}
      </ol>
      {anyLink && (
        <p className={styles.caution}>
          Older versions may be missing fixes. Prefer the newest version unless you need one of these.
        </p>
      )}
      {omitted > 0 && (
        <p className={styles.omitted}>
          {omitted} more {omitted === 1 ? "version is" : "versions are"} not shown.
        </p>
      )}
    </div>
  );
}
