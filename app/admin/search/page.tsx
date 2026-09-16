import { getTopSearches } from "@/lib/catalog";
import styles from "./page.module.css";

/**
 * Top-searches dashboard — leaf `3.c.ii.zo`, closes out `3.c.ii`
 * (Analytics). Same plain, unthemed admin-page shell as
 * `/admin/featuring`, `/admin/sponsored`, and `/admin/traffic` (no
 * `CategoryThemeScope`, no storefront header/search nav), same
 * unauthenticated dev-route posture `3.c.i.zi` decided for the rest of
 * `3.c`.
 *
 * Entirely read-only, same as `/admin/traffic` — no toggle, form, or
 * mutation — so this stays a plain server component; `getTopSearches`
 * (`lib/catalog.ts`) does the aggregation server-side off of
 * `logSearchQuery`'s accumulated rows and this file only renders what
 * comes back.
 *
 * Reuses `/admin/traffic`'s hand-rolled inline-bar-chart approach
 * rather than introducing a chart dependency — same single-series,
 * static-visual shape as that dashboard's "Views by app" chart, just
 * ranked by search count instead of view count.
 */
export default async function AdminSearchPage() {
  const { totalSearches, distinctQueryCount, topQueries } = await getTopSearches();
  const maxCount = Math.max(1, ...topQueries.map((row) => row.count));
  const numberFormat = new Intl.NumberFormat("en-US");

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Top Searches</h1>
      <p className={styles.subheading}>
        Search queries logged from `/search`, ranked by how often each
        one was searched.
      </p>

      <div className={styles.summaryRow}>
        <div className={styles.statCard}>
          <p className={styles.statValue}>{numberFormat.format(totalSearches)}</p>
          <p className={styles.statLabel}>Total searches</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statValue}>{numberFormat.format(distinctQueryCount)}</p>
          <p className={styles.statLabel}>Distinct queries</p>
        </div>
      </div>

      {topQueries.length === 0 ? (
        <p className={styles.empty}>
          No searches logged yet — visit `/search?q=...` to record one.
        </p>
      ) : (
        <>
          <section aria-labelledby="top-queries-heading">
            <h2 id="top-queries-heading" className={styles.sectionHeading}>
              Top queries
            </h2>
            <div className={styles.chart}>
              {topQueries.map((row) => (
                <div key={row.query} className={styles.chartRow}>
                  <span className={styles.chartLabel} title={row.query}>
                    {row.query}
                  </span>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.bar}
                      style={{ width: `${(row.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className={styles.chartValue}>{numberFormat.format(row.count)}</span>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="breakdown-heading">
            <h2 id="breakdown-heading" className={styles.sectionHeading}>
              Per-query breakdown
            </h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Query</th>
                  <th className={styles.th}>Searches</th>
                </tr>
              </thead>
              <tbody>
                {topQueries.map((row) => (
                  <tr key={row.query} className={styles.row}>
                    <td className={styles.td}>{row.query}</td>
                    <td className={styles.td}>{numberFormat.format(row.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
