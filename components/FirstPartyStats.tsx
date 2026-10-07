import type { App } from "@/lib/mock-data";
import { combinedDownloadTotal, combinedRating, formatDownloadCount } from "@/lib/carried-over-stats";

/**
 * Task 45b — a first-party app's rating and download totals, shown Play-Store
 * style as ONE number each, with no "migrated" label. When the app carries
 * history from before it was listed (Zealot's neutral `base_stats`, Task
 * 45a/45e), this store's own counters are folded in: downloads are the
 * carried-over base plus `install_count`, and the rating is the weighted average
 * of the carried-over rating and this store's own. With no carried-over base it
 * renders exactly the store-native figures it always did (`★ 0.0 (0)` /
 * `0+ installs`), so an app that was never distributed by hand is unchanged.
 *
 * The two class names come from the caller because the detail page and `Hero`
 * style the row from different CSS modules, the same shape `ReportedStats` uses.
 */
export default function FirstPartyStats({
  app,
  ratingClassName,
  mutedClassName,
}: {
  app: App;
  ratingClassName: string;
  mutedClassName: string;
}) {
  const rating = combinedRating(app);
  const average = rating?.average ?? app.avg_rating;
  const ratingCount = rating?.count ?? app.rating_count;
  const downloads = combinedDownloadTotal(app);

  return (
    <>
      <span className={ratingClassName}>
        <span aria-hidden="true">★</span> {average.toFixed(1)}
        <span className={mutedClassName}> ({ratingCount.toLocaleString()})</span>
      </span>
      <span className={mutedClassName}>
        {downloads === null
          ? `${app.install_count.toLocaleString()}+ installs`
          : `${formatDownloadCount(downloads)} downloads`}
      </span>
    </>
  );
}
