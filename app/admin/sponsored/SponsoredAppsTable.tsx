import type { App } from "@/lib/catalog";
import AppIcon from "@/components/AppIcon";
import styles from "./page.module.css";

/**
 * Read-only display of sponsored placement — leaf `5.j.ii.zi`, replacing
 * `SponsoredSlotsPanel`'s create/edit/delete form. Sponsored windows now
 * come straight from the Console's (Zealot) signed index
 * (`App.sponsored_slots`, `lib/sources/zealot.ts`), authored in Zealot's
 * own admin (`5.j.i.zo`) — there is nothing left here to schedule, same
 * "no longer a client component" shift `FeaturingTable` went through for
 * `5.g.v.zi`.
 *
 * "Active now" is computed once on the server against `referenceDate`,
 * mirroring `getActiveSponsoredSlot`'s own comparison in
 * `lib/catalog.ts` rather than re-implementing it client-side — no
 * client state to keep in sync with a server value here, unlike the
 * old panel's `todayStr()`.
 */
function isActive(slot: { starts_at: string; ends_at: string }, nowIso: string): boolean {
  return slot.starts_at <= nowIso && nowIso <= slot.ends_at;
}

export default function SponsoredAppsTable({
  apps,
  referenceDate = new Date(),
}: {
  apps: App[];
  referenceDate?: Date;
}) {
  const nowIso = referenceDate.toISOString();

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.th}>App</th>
          <th className={styles.th}>Windows</th>
          <th className={styles.th}>Status</th>
        </tr>
      </thead>
      <tbody>
        {apps.length === 0 && (
          <tr>
            <td className={styles.td} colSpan={3}>
              No app currently carries a sponsored-placement window — the
              storefront shows its default placeholder.
            </td>
          </tr>
        )}
        {apps.map((app) => {
          const active = app.sponsored_slots.some((slot) => isActive(slot, nowIso));
          return (
            <tr key={app.slug} className={styles.row}>
              <td className={styles.td}>
                <div className={styles.appCell}>
                  <span className={styles.icon}>
                    <AppIcon
                      name={app.name}
                      primaryColor={app.primary_color}
                      secondaryColor={app.secondary_color}
                      tertiaryColor={app.tertiary_color}
                    />
                  </span>
                  <span>{app.name}</span>
                </div>
              </td>
              <td className={styles.td}>
                <div className={styles.windows}>
                  {app.sponsored_slots.map((slot, i) => (
                    <span key={i}>
                      {slot.starts_at} &ndash; {slot.ends_at}
                    </span>
                  ))}
                </div>
              </td>
              <td className={styles.td}>
                {active ? (
                  <span className={styles.statusActive}>Active now</span>
                ) : (
                  <span className={styles.statusInactive}>Not active</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
