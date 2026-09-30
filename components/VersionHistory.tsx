import type { App } from "@/lib/catalog";
import { isNotProvided } from "@/lib/trust";
import type { VersionEntry } from "@/lib/version-history";
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
 * Deliberately absent: a per-version date (the index has none; `updated_at`
 * is the app's, not the version's), download links and checksums for old
 * versions (`5.c.ii.zo`, Held). Rollout state is written out as text so it
 * never depends on colour alone.
 *
 * Shell classes are copied from `Changelog`/`DataSafety` rather than adding
 * a third variant. Not mounted on any page yet (`5.c.vi.zo`).
 */

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

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Version history</span>
      <ol className={styles.list}>
        {entries.map((entry, index) => (
          // `release_id` may repeat or be missing, so the position is part of the key.
          <li key={`${index}-${entry.version_name}`} className={styles.item}>
            <div className={styles.meta}>
              <span className={styles.version}>Version {entry.version_name}</span>
              {entry.size_mb !== null && <span className={styles.detail}>{entry.size_mb} MB</span>}
              <span className={styles.detail}>{rolloutText(entry)}</span>
            </div>
            <p className={styles.notes}>{entry.changelog ?? "No changelog provided."}</p>
          </li>
        ))}
      </ol>
      {omitted > 0 && (
        <p className={styles.omitted}>
          {omitted} more {omitted === 1 ? "version is" : "versions are"} not shown.
        </p>
      )}
    </div>
  );
}
