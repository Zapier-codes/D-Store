import { groupPermissions } from "@/lib/permission-groups";
import { GlassPill } from "./glass";
import PermissionIcon from "./PermissionIcon";
import styles from "./PermissionsDisclosure.module.css";

/**
 * Permissions: leaf 0.f.ii.zo (App Detail Page -> Transparency), rebuilt by operator-directed 2026-10-08 (slice 5
 * of the details page rework, brief section 5F). Per docs/D-STORE.md section 2/5.F, permissions are one of the
 * named sideload trust signals that "must be first-class UI, not buried", so the groups are always visible, not
 * behind a toggle.
 *
 * `App.permissions` is `string[]` of raw Android manifest names. They are sorted into plain-language groups
 * (`groupPermissions`, lib/permission-groups.ts: Camera, Location, Network ...), each a transparent glass pill
 * with a small icon. A name the helper does not recognise lands in "Other", never dropped. The raw names stay
 * available under a native <details> ("Technical names"), so nothing the source reported is hidden; the
 * names wrap inside their own box (some are 70 characters long and once zoomed the whole page out).
 *
 * The component owns its section and heading and renders nothing when the source did not provide permissions
 * (`notProvided`): an empty list there would falsely read as "requests none". A provided, empty list still says
 * so, honestly, as it did before. Server component.
 */
export default function PermissionsDisclosure({
  permissions,
  notProvided = false,
}: {
  permissions: string[];
  /** 5.h.iii.zo: the source didn't say; an empty list here would falsely read as "requests none". */
  notProvided?: boolean;
}) {
  if (notProvided) return null;
  const groups = groupPermissions(permissions);

  return (
    <section className={styles.root} aria-labelledby="permissions-heading">
      <h2 id="permissions-heading" className={styles.title}>
        Permissions
      </h2>
      {groups.length === 0 ? (
        <p className={styles.empty}>This app requests no special permissions.</p>
      ) : (
        <>
          <ul className={styles.chips} aria-label="Permissions this app requests">
            {groups.map((group) => (
              <li key={group.id} className={styles.chip}>
                <GlassPill>
                  <PermissionIcon group={group.id} />
                  {group.label}
                </GlassPill>
              </li>
            ))}
          </ul>
          <details className={styles.technical}>
            <summary className={styles.summary}>Technical names</summary>
            <ul className={styles.names}>
              {groups.flatMap((group) =>
                group.items.map((name) => (
                  <li key={name} className={styles.name}>
                    <code className={styles.code}>{name}</code>
                  </li>
                )),
              )}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
