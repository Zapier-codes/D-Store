import { getNewAndUpdated, getNewPage } from "@/lib/catalog";
import ShelfGrid from "@/components/ShelfGrid";
import AppCard from "@/components/AppCard";
import Pager from "@/components/Pager";
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
 *
 * Paged in table mode — leaf `5.l.xi.zi`. With the Supabase env set the chart is read one page
 * at a time (`getNewPage`, 24 a page, order `new`): page 1 is the first-party apps (newest
 * first) and then the first third-party rows; later pages are third-party only, reached by the
 * "Next page" link (`?after=<cursor>`). One list, no ranks, so no rank offset is carried. The
 * catalog is read by keyset, so there are no page numbers and no total, and going back is the
 * browser's back button. First-party apps lead page 1 rather than being interleaved by date, which
 * a keyset page cannot do. With the table off, or when a page read fails, the page is exactly the
 * whole-list page it was: no `after`, no pager, the "Updated <date>" caption on every card.
 */

const CAPTION_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export default async function NewAndUpdatedChartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const page = await getNewPage(query.after);
  const apps = page ? page.apps : await getNewAndUpdated(Infinity);

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

      <Pager basePath="/charts/new" nextCursor={page ? page.nextCursor : null} />
    </main>
  );
}
