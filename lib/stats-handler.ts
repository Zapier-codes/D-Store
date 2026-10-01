/**
 * `GET /api/stats` — leaf `5.g.v.zo`. The logic lives here, with injected
 * dependencies, so every status is tested without Next (the shape of
 * `lib/report-decision.ts`); `app/api/stats/route.ts` only wires the real ones.
 *
 * Order: the token check first (`503` when the secret is unset or unusable,
 * `401` for a missing, malformed or wrong header, before anything touches the
 * database), then the store: `200` with the document, `503` when Supabase is
 * not configured, `502` when it could not be read. Fixed-string bodies, `no-store`
 * on every answer, nothing echoing the token, a key or a figure on failure.
 * `GET` only: the route exports nothing else, so Next answers other methods `405`.
 */

import { checkStatsAuth } from "./stats-auth";
import { readStoreStats, type StatsStoreResult } from "./stats-store";

export interface StatsHandlerDeps {
  checkAuth?: typeof checkStatsAuth;
  readStats?: () => Promise<StatsStoreResult>;
}

const NO_STORE = { "Cache-Control": "no-store" };

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: NO_STORE });
}

export async function handleStats(request: Request, deps: StatsHandlerDeps = {}): Promise<Response> {
  const auth = await (deps.checkAuth ?? checkStatsAuth)(request.headers);
  if (!auth.ok) return auth.status === 401 ? fail(401, "Unauthorized") : fail(503, "Stats are not available");

  const result = await (deps.readStats ?? readStoreStats)();
  if (result.ok) return Response.json(result.stats, { headers: NO_STORE });
  return result.reason === "not_configured" ? fail(503, "Stats are not available") : fail(502, "Could not read the stats");
}
