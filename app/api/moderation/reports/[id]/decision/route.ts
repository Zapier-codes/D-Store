import { handleReportDecision } from "@/lib/report-decision";
import { requireModeratorRequest } from "@/lib/moderator-gate";

/**
 * Close a report with a decision — leaf `3.c.viii.zo`. The order of work, the
 * statuses and what is never echoed are documented in `lib/report-decision.ts`;
 * this file only wires the moderator guard in. `/api/moderation` is also behind
 * the middleware gate (`3.c.vi.zo`); the guard inside the handler is the second
 * layer, and it runs first.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleReportDecision(request, id, { requireModerator: requireModeratorRequest });
}
