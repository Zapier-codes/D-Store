import { handleStats } from "@/lib/stats-handler";

/**
 * Read-only, token-authenticated stats for Zealot's admin — leaf `5.g.v.zo`.
 * Deliberately at `/api/stats`, outside `/api/admin/` (the shared-password
 * gate would refuse Zealot's bearer token). Logic, order and statuses are in
 * `lib/stats-handler.ts`; `GET` is the only method exported.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleStats(request);
}
