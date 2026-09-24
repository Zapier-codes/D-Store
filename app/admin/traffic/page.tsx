import { getTrafficSummary } from "@/lib/catalog";
import { requireAdminPage } from "@/lib/admin-auth";
import styles from "./page.module.css";

/**
 * Traffic dashboard — leaf `3.c.ii.zi`, the first leaf of `3.c.ii`
 * (Analytics). Same plain, unthemed admin-page shell as
 * `/admin/featuring` and `/admin/sponsored` (no `CategoryThemeScope`,
 * no storefront header/search nav — same reasoning those pages'
 * comments already gave), same unauthenticated dev-route posture
 * `3.c.i.zi` decided for the rest of `3.c`.
 *
 * Unlike `/admin/featuring`/`/admin/sponsored`, this page is entirely
 * read-only — no toggle, form, or mutation — so it stays a plain
 * server component with no client-component half; `getTrafficSummary`
 * (`lib/catalog.ts`) does the aggregation server-side and this file
 * only renders what comes back.
 *
 * The bar chart is hand-rolled inline SVG rather than a charting
 * library: no chart dependency exists in `package.json` today, and
 * `components/AppIcon.tsx` already established the pattern of a
 * self-contained, no-network-request SVG for exactly this kind of
 * "small, static visual, no interactivity" need — bar width is just
 * `view_count / maxViewCount` scaled to the chart's pixel width, no
 * axes/scales library required for a single-series bar chart.
 */
export default async function AdminTrafficPage() {
  await requireAdminPage(); // 3.c.iv.zi — defence in depth behind middleware.ts
  const { totalInstalls, totalViews, appCount, perApp } = await getTrafficSummary();
  const maxViewCount = Math.max(1, ...perApp.map((row) => row.view_count));
  const numberFormat = new Intl.NumberFormat("en-US");

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Traffic Dashboard</h1>
      <p className={styles.subheading}>
        Cumulative install and view counts across the catalog, ranked by
        views.
      </p>

      <div className={styles.summaryRow}>
        <div className={styles.statCard}>
          <p className={styles.statValue}>{numberFormat.format(totalInstalls)}</p>
          <p className={styles.statLabel}>Total installs</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statValue}>{numberFormat.format(totalViews)}</p>
          <p className={styles.statLabel}>Total views</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statValue}>{numberFormat.format(appCount)}</p>
          <p className={styles.statLabel}>Apps tracked</p>
        </div>
      </div>

      <section aria-labelledby="views-by-app-heading">
        <h2 id="views-by-app-heading" className={styles.sectionHeading}>
          Views by app
        </h2>
        <div className={styles.chart}>
          {perApp.map((row) => (
            <div key={row.slug} className={styles.chartRow}>
              <span className={styles.chartLabel} title={row.name}>
                {row.name}
              </span>
              <div className={styles.barTrack}>
                <div
                  className={styles.bar}
                  style={{ width: `${(row.view_count / maxViewCount) * 100}%` }}
                />
              </div>
              <span className={styles.chartValue}>{numberFormat.format(row.view_count)}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="breakdown-heading">
        <h2 id="breakdown-heading" className={styles.sectionHeading}>
          Per-app breakdown
        </h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>App</th>
              <th className={styles.th}>Installs</th>
              <th className={styles.th}>Views</th>
            </tr>
          </thead>
          <tbody>
            {perApp.map((row) => (
              <tr key={row.slug} className={styles.row}>
                <td className={styles.td}>{row.name}</td>
                <td className={styles.td}>{numberFormat.format(row.install_count)}</td>
                <td className={styles.td}>{numberFormat.format(row.view_count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
