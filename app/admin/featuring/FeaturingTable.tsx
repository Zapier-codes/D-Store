import type { App } from "@/lib/catalog";
import AppIcon from "@/components/AppIcon";
import styles from "./page.module.css";

/**
 * Read-only display of Featured/Editors' Pick — leaf `3.c.i.zi`
 * originally, **made read-only by `5.g.v.zi`**. Both flags now come
 * straight from the Console's (Zealot) signed index
 * (`lib/sources/zealot.ts`'s `editorial` block), so this repo stays
 * write-free on the editorial side; there is nothing left here to
 * toggle. No longer a client component — the optimistic-PATCH toggle
 * logic this file used to hold (`3.a.iv`-style click-and-see-it-flip)
 * has no server-side mutation to call now that
 * `app/api/admin/apps/[slug]/featuring/route.ts` answers `410 Gone`
 * for every PATCH, so plain server-rendered markup is all this needs.
 */
export default function FeaturingTable({ apps }: { apps: App[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.th}>App</th>
          <th className={styles.th}>Featured</th>
          <th className={styles.th}>Editors&rsquo; Pick</th>
        </tr>
      </thead>
      <tbody>
        {apps.map((app) => (
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
              <span
                role="status"
                aria-label={app.is_featured ? "Featured" : "Not featured"}
                className={`${styles.toggle} ${app.is_featured ? styles.toggleOn : ""}`}
              >
                <span className={styles.toggleKnob} />
              </span>
            </td>
            <td className={styles.td}>
              <span
                role="status"
                aria-label={app.is_editors_pick ? "Editors' Pick" : "Not an Editors' Pick"}
                className={`${styles.toggle} ${app.is_editors_pick ? styles.toggleOn : ""}`}
              >
                <span className={styles.toggleKnob} />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
