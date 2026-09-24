import type { DataSafetyInfo } from "@/lib/mock-data";
import styles from "./DataSafety.module.css";

/**
 * Data safety disclosure — leaf 0.j.iii.zo (App Detail Page →
 * Transparency, the `0.j.iii` audit note's second finding). Same
 * always-visible-callout shell `PermissionsDisclosure` (0.f.ii.zo) and
 * `PlayStoreDisclosure` (0.f.ii.zi) already use, for visual
 * consistency across the Transparency subsection — this is a sibling
 * disclosure, not a variant of Permissions, per the leaf spec ("own
 * section, not folded into Permissions, since Play treats them as
 * genuinely separate disclosures").
 *
 * `App.data_safety` (`lib/mock-data.ts`) is a small typed object, not
 * a raw list — unlike `permissions[]`, every field here (does it
 * collect anything, is it shared, is it encrypted in transit, can you
 * ask for deletion) needs its own line regardless of whether
 * `collects_data` is true, so the honest-empty-state pattern here is
 * "still show every line, just with a different lead sentence" rather
 * than `PermissionsDisclosure`'s "swap the whole list for one
 * sentence."
 */
export default function DataSafety({ dataSafety }: { dataSafety: DataSafetyInfo }) {
  const provided = dataSafety.provided ?? true;

  if (!provided) {
    return (
      <div className={styles.wrapper}>
        <span className={styles.label}>Data this app collects</span>
        <p className={styles.empty}>
          Not provided by source — this app&rsquo;s listing has no Play-style data-safety
          disclosure.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Data this app collects</span>

      {dataSafety.collects_data ? (
        <ul className={styles.list}>
          {dataSafety.data_types.map((type) => (
            <li key={type} className={styles.item}>
              <code className={styles.code}>{type}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>This app collects no data.</p>
      )}

      <ul className={styles.facts}>
        <li>
          {dataSafety.shared_with_third_parties
            ? "Shared with third parties"
            : "Not shared with third parties"}
        </li>
        <li>
          {dataSafety.data_encrypted_in_transit
            ? "Data is encrypted in transit"
            : "Data is not encrypted in transit"}
        </li>
        <li>
          {dataSafety.can_request_data_deletion
            ? "You can request data deletion"
            : "No data deletion request option"}
        </li>
      </ul>
    </div>
  );
}
