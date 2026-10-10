import type { App } from "@/lib/catalog";
import { isNotProvided, isThirdParty } from "@/lib/trust";
import { decideRollback, type RollbackWithheldReason } from "@/lib/rollback";
import type { DownloadWithheldReason, VersionEntry } from "@/lib/version-history";
import styles from "./VersionHistory.module.css";
import { updateDeltaLabel } from "@/lib/play-ports";

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
 * `5.c.ii.zo` / `5.c.xi.zi` — direct download links for older versions. Every
 * entry after the first gets either a link or a one-line reason there is none,
 * decided by `decideRollback` (which defers to `decideDownload`: a link only
 * for a release that is neither halted nor pulled and is fully rolled out).
 * The link is a plain `<a>`: operator-directed 2026-10-10 removed the old
 * "record the rollback in a device-local install record" behaviour, since a
 * website can only download — the click is just the download. The first entry
 * is the newest release: it is offered by the download control and covered by
 * the advisory, so it gets neither a link nor a reason here (`newest`, and
 * `invalid`, render nothing). No checksum or signing fingerprint is
 * shown for an older version.
 *
 * `5.c.xi.zo` — the caution under the list appears once, only when at least one
 * link is shown. Besides "may be missing fixes" it says Android may refuse an
 * older version over a newer one, so the newer one may need uninstalling first,
 * which can remove its data. It names no cause for any release. That Android
 * behaviour is general knowledge and was not checked on a device.
 *
 * Deliberately absent: a per-version date (the index carries `released_at`,
 * but whether to show it is an open operator call). Rollout state is written
 * out as text so it never depends on colour alone.
 *
 * Shell classes are copied from `Changelog`/`DataSafety` rather than adding
 * a third variant.
 *
 * Z-P13: an entry whose index carried `delta_patches[]` shows one honest line —
 * "Update delta from version X, N KB" — saying an update to this version can be
 * delivered as a smaller patch when installed from X. It is informational: the
 * storefront cannot apply an APK patch. `updateDeltaLabel` returns null (nothing
 * rendered) when there are no deltas, so this is additive to every cached index.
 */

const WITHHELD_TEXT: Record<DownloadWithheldReason, string> = {
  pulled: "The publisher has withdrawn this version, so it is not offered for download.",
  halted: "The publisher has paused this version, so it is not offered for download.",
  rolling_out: "This version is still rolling out, so it is not offered for download.",
  no_link: "No download link is provided for this version.",
};

// `newest` and `invalid` render nothing; only decideDownload's four reasons get a line.
function isWithheldLine(reason: RollbackWithheldReason): reason is DownloadWithheldReason {
  return Object.prototype.hasOwnProperty.call(WITHHELD_TEXT, reason);
}

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
  const offers = entries.map((_entry, index) => decideRollback(entries, index));
  const anyLink = offers.some((offer) => offer.offered);

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Version history</span>
      <ol className={styles.list}>
        {entries.map((entry, index) => {
          const offer = offers[index];
          // Z-P13: the update delta this version carries, if the index published one.
          const deltas = entry.delta_patches ?? [];
          const delta = updateDeltaLabel(deltas.length > 0, deltas[0]);
          return (
            // `release_id` may repeat or be missing, so the position is part of the key.
            <li key={`${index}-${entry.version_name}`} className={styles.item}>
              <div className={styles.meta}>
                <span className={styles.version}>Version {entry.version_name}</span>
                {entry.size_mb !== null && <span className={styles.detail}>{entry.size_mb} MB</span>}
                <span className={styles.detail}>{rolloutText(entry)}</span>
              </div>
              <p className={styles.notes}>{entry.changelog ?? "No changelog provided."}</p>
              {delta !== null && <p className={styles.delta}>{delta}</p>}
              {offer.offered ? (
                <a
                  className={styles.download}
                  href={isThirdParty(app) ? offer.url : `/api/apps/${encodeURIComponent(app.slug)}/download?version=${encodeURIComponent(entry.version_name)}`}
                  rel="noopener noreferrer"
                >
                  Download version {entry.version_name}
                </a>
              ) : (
                isWithheldLine(offer.reason) && <p className={styles.withheld}>{WITHHELD_TEXT[offer.reason]}</p>
              )}
            </li>
          );
        })}
      </ol>
      {anyLink && (
        <p className={styles.caution}>
          Older versions may be missing fixes. Prefer the newest version unless you need one of these.
          Android may refuse to install an older version over a newer one; if it does, the newer version may need
          to be uninstalled first, which can remove its data.
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
