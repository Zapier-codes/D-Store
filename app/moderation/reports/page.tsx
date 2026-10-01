import type { Metadata } from "next";
import ReportQueue from "@/components/ReportQueue";
import { getAppBySlug } from "@/lib/catalog";
import { requireModeratorPage } from "@/lib/moderator-gate";
import { decodeReportCursor, encodeReportCursor, readReports, type ReportStatusFilter } from "@/lib/report-store";

/**
 * Report queue, list only — leaf `3.c.ix.zi`. The first real use of
 * `requireModeratorPage()` (layer 3 of the moderator gate): it is the first
 * thing the page does, and a request that somehow got past the middleware
 * without a good token gets a 404, not the list.
 *
 * `?status=closed` shows closed reports (anything else is open); `?cursor=` is
 * the opaque cursor from the previous page (a malformed one is ignored and the
 * first page is shown). The list never shows `details`: the detail page
 * (`3.c.ix.zo`) is the only place anonymous free text is read.
 *
 * App names come from the catalog (`getAppBySlug`, one lookup per distinct
 * slug on the page). A catalog failure, or a slug that no longer resolves,
 * shows the bare slug: the queue never turns into an error page because the
 * catalog is down.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Report queue",
  robots: { index: false, follow: false },
};

export default async function ReportQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireModeratorPage();

  const query = await searchParams;
  const rawStatus = Array.isArray(query.status) ? query.status[0] : query.status;
  const status: ReportStatusFilter = rawStatus === "closed" ? "closed" : "open";
  const rawCursor = Array.isArray(query.cursor) ? query.cursor[0] : query.cursor;
  const cursor = decodeReportCursor(rawCursor);

  const result = await readReports({ status, cursor });

  const appNames: Record<string, string> = {};
  if (result.ok) {
    const slugs = [...new Set(result.reports.flatMap((r) => (r.app_slug !== null ? [r.app_slug] : [])))];
    const lookups = await Promise.allSettled(slugs.map((slug) => getAppBySlug(slug)));
    lookups.forEach((l, i) => {
      if (l.status === "fulfilled" && l.value) appNames[slugs[i]] = l.value.name;
    });
  }

  const nextHref =
    result.ok && result.next_cursor
      ? `/moderation/reports?status=${status}&cursor=${encodeURIComponent(encodeReportCursor(result.next_cursor))}`
      : null;
  const switchHref = `/moderation/reports?status=${status === "open" ? "closed" : "open"}`;

  return <ReportQueue status={status} result={result} appNames={appNames} now={Date.now()} nextHref={nextHref} switchHref={switchHref} />;
}
