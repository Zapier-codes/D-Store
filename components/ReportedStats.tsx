import type { ThirdPartyStats } from "@/lib/mock-data";
import { formatReportedDownloads } from "@/lib/third-party-stats";

/**
 * A third-party app's own rating and download figure, in the stats row of the
 * detail page and `Hero` — leaf `5.h.vii.zo`. Replaces the store-native
 * `★ 0.0 (0)` and `0+ installs`, which are this store's own counters and are
 * always 0 for a third-party app. Every figure is labelled with its source and
 * as reported: D-Store did not measure it.
 *
 * The two class names come from the caller because the detail page and `Hero`
 * style the row from different CSS modules.
 */
export default function ReportedStats({
  stats,
  ratingClassName,
  mutedClassName,
}: {
  stats: ThirdPartyStats | null;
  ratingClassName: string;
  mutedClassName: string;
}) {
  const rating = stats?.rating ?? null;
  const downloads = stats?.downloads ?? null;

  return (
    <>
      {rating === null ? null : rating.total === 0 ? (
        <span className={mutedClassName}>No ratings yet</span>
      ) : (
        <span className={ratingClassName}>
          <span aria-hidden="true">★</span> {rating.average.toFixed(1)}
          <span className={mutedClassName}>
            {" "}
            ({rating.total.toLocaleString()} {rating.total === 1 ? "rating" : "ratings"})
          </span>
        </span>
      )}
      {downloads !== null && (
        <span className={mutedClassName}>
          {formatReportedDownloads(downloads)} downloads
        </span>
      )}
    </>
  );
}
