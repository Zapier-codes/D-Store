import styles from "./PermissionsDisclosure.module.css";

/**
 * Permissions disclosure list — leaf 0.f.ii.zo (App Detail Page →
 * Transparency). Per docs/D-STORE.md §2/§5.F: permissions are one of
 * the named sideload trust signals that "must be first-class UI, not
 * buried," so — same call as `PlayStoreDisclosure` (0.f.ii.zi) — this
 * renders as an always-visible list, not a collapsible `<details>`.
 *
 * `App.permissions` (lib/mock-data.ts) is `string[]`, raw Android
 * manifest constant names (e.g. `INTERNET`, `WRITE_EXTERNAL_STORAGE`).
 * Several apps in the mock dataset have an empty array — rendered as
 * an explicit "requests no special permissions" statement, the same
 * honest-empty-state pattern `PlayStoreDisclosure` uses for a `null`
 * rejection reason, rather than hiding the section.
 */
export default function PermissionsDisclosure({
  permissions,
  notProvided = false,
}: {
  permissions: string[];
  /** 5.h.iii.zo — the source didn't say; an empty list here would falsely read as "requests none". */
  notProvided?: boolean;
}) {
  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Permissions this app requests</span>
      {notProvided ? (
        <p className={styles.empty}>Not provided</p>
      ) : permissions.length > 0 ? (
        <ul className={styles.list}>
          {permissions.map((permission) => (
            <li key={permission} className={styles.item}>
              <code className={styles.code}>{permission}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>This app requests no special permissions.</p>
      )}
    </div>
  );
}
