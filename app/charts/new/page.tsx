import { getNewAndUpdated } from "@/lib/catalog";
import ShelfGrid from "@/components/ShelfGrid";
import AppCard from "@/components/AppCard";
import styles from "./page.module.css";

/**
 * New & Updated chart page — leaf `3.b.iii.zo` (Metrics Pipeline,
 * Charts), the same shape as `3.b.iii.zi`'s Top Free chart: a
 * standalone full-list page, distinct from the home page's short
 * New & Updated shelf preview (`0.d`), both reading the same
 * `getNewAndUpdated` (`lib/catalog.ts`, `updated_at`-descending).
 *
 * No catalog.ts changes needed for the "whole list, not a preview"
 * requirement every chart page has — unlike `getTopFreeApps`
 * (`3.b.iii.zi`), which had no `limit` param to begin with,
 * `getNewAndUpdated` already had one (`= 12`, for the home shelf) that
 * had to stay a *default*, not be removed, since the home page still
 * calls it with no arguments. `getNewAndUpdated(Infinity)` below reads
 * as "no cap" at the call site without touching that function at all —
 * `Array.prototype.slice(0, Infinity)` returns the whole array, so this
 * needed no new "unlimited" parameter value or second exported function.
 *
 * No `rank` prop on `AppCard` here — per the open question this leaf
 * was flagged with in HANDOVER.md, decided now: recency isn't a
 * competitive standing the way an install-count position is, so a
 * numbered badge would imply an ordering that doesn't mean what Top
 * Free's numbers mean. `AppCard`'s new `caption` prop (added this same
 * leaf) substitutes a plain "Updated <date>" line instead, giving each
 * card the one piece of information this chart is actually about.
 *
 * No `CategoryThemeScope` here either, same reasoning as Top Free — a
 * cross-category chart has no single category to scope to.
 */

const CAPTION_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export default async function NewAndUpdatedChartPage() {
  const apps = await getNewAndUpdated(Infinity);

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>New &amp; Updated</h1>
      <p className={styles.subheading}>
        The most recently added or updated apps on D-Store.
      </p>

      <ShelfGrid>
        {apps.map((app) => (
          <AppCard
            key={app.slug}
            app={app}
            caption={`Updated ${CAPTION_DATE_FORMAT.format(new Date(app.updated_at))}`}
          />
        ))}
      </ShelfGrid>
    </main>
  );
}
