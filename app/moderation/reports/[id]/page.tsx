import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReportDetail from "@/components/ReportDetail";
import { getAppBySlug } from "@/lib/catalog";
import { requireModeratorPage } from "@/lib/moderator-gate";
import { readReport } from "@/lib/report-store";

/**
 * One report and its decision form — leaf `3.c.ix.zo`. `requireModeratorPage()`
 * is the first thing the page does. An id the store calls `not_found` (a bad
 * shape or no such row) is `notFound()`; `not_configured` and `unavailable`
 * render a plain message instead. The app name comes from the catalog and a
 * failure there shows the bare slug, never an error page.
 *
 * `details` is anonymous attacker-controlled text: `ReportDetail` renders it as
 * text only. The page stays a server component; only the form is a client one.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Report",
  robots: { index: false, follow: false },
};

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModeratorPage();

  const { id } = await params;
  const result = await readReport(id);
  if (!result.ok && result.reason === "not_found") notFound();

  let appName: string | null = null;
  if (result.ok && result.report.app_slug !== null) {
    try {
      appName = (await getAppBySlug(result.report.app_slug))?.name ?? null;
    } catch {
      appName = null;
    }
  }

  return <ReportDetail result={result} appName={appName} backHref="/moderation/reports" />;
}
