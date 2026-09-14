import type { App } from "@/lib/catalog";
import styles from "./PlayStoreDisclosure.module.css";

/**
 * "Why not on Play Store" disclosure — leaf 0.f.ii.zi (App Detail Page
 * → Transparency). Per docs/D-STORE.md §5.F: 'Explicit "why not on Play
 * Store" disclosure per app | Builds trust through transparency rather
 * than hiding it.'
 *
 * Deliberately NOT a collapsible `<details>`/`<summary>` disclosure
 * widget, even though "disclosure UI" might suggest one — docs/D-STORE.md
 * §2 is explicit that sideload trust signals (checksum, permissions,
 * source link — this belongs in that same family) "must be first-class
 * UI, not buried." Collapsing it behind a click-to-expand would work
 * against the one requirement this leaf exists to satisfy, so it
 * renders as an always-visible callout instead, same visual weight as
 * ChecksumDisplay/SignatureInfo.
 *
 * `App.play_store_rejection_reason` (lib/mock-data.ts) is `string |
 * null` — most apps in the mock dataset are `null` (no *documented*
 * policy conflict, they just were never listed on Play Store; D-Store
 * exists as an alternative distribution channel independent of any
 * rejection). A small number (F-Droid, MaterialOS, Night Mode Enabler,
 * Amexia, Enhancement, Greyscale) have a real, specific reason. Null is
 * rendered as an honest "nothing documented" statement, not skipped or
 * left blank — omitting the section entirely for null apps would be
 * its own kind of buried.
 */
export default function PlayStoreDisclosure({ app }: { app: App }) {
  const reason = app.play_store_rejection_reason;

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Why isn&rsquo;t this on Play Store?</span>
      {reason ? (
        <p className={styles.reason}>{reason}</p>
      ) : (
        <p className={styles.reason}>
          No specific Play Store policy conflict is on record for {app.name} — it may simply never
          have been submitted there. D-Store distributes apps directly, independent of Play Store
          listing status either way.
        </p>
      )}
    </div>
  );
}
