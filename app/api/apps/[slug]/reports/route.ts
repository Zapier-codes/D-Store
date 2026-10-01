import { catalogHasSlug } from "@/lib/catalog";
import { handleReport } from "@/lib/report-intake";

/**
 * Anonymous report intake — leaves `3.c.iii.zi` part 1 and `3.c.v.zo`. The
 * order of work, statuses and the stored shape are documented in
 * `lib/report-intake.ts`; this file only wires the catalog in.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handleReport(request, slug, { catalogHasSlug });
}
