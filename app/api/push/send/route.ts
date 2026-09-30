import { checkRateLimit } from "../../../../lib/rate-limit";
import { DispatchTenantError, getDispatchCatalog } from "@/lib/catalog";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { checkDispatchAuth } from "@/lib/push-dispatch-auth";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { runPush } from "@/lib/push-run";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { errorResponse } from "@/lib/push-request";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { isPushStoreConfigured } from "@/lib/push-store";

/**
 * `POST /api/push/send` — leaf `5.k.xvii.zo`. Runs one Web Push sending pass:
 * plan, fan out, send, prune dead endpoints, record baselines (`runPush`).
 * **This is the only route that sends.** `POST /api/push/dispatch` stays
 * read-only on purpose, so the plan can be inspected without side effects.
 *
 * Explicit opt-in: the route does nothing unless `PUSH_SEND_ENABLED` is
 * exactly the string `true`. Unset, empty or any other value answers `503`,
 * the same fixed body as every other "not available" case, so a caller learns
 * nothing about which piece is missing. Even with everything else configured
 * a deployment therefore cannot send until the operator says so.
 *
 * Order of work (each step short-circuits):
 *   1. `checkDispatchAuth` — `401` or `503`, before anything else is read.
 *   2. opt-in (`PUSH_SEND_ENABLED === "true"`) — `503`.
 *   3. `isPushStoreConfigured` — `503`.
 *   4. `getDispatchCatalog` — `421` for a non-default tenant, `502` otherwise.
 *      The catalog is read here because it is bound to the current request.
 *   5. `runPush` — `200` with counts only, or a mapped failure.
 *
 * Statuses, for the operator:
 *   200  a run happened; body is `{ counts, stopped_early, anomaly,
 *        baseline_write }` and nothing else (no endpoint, key, slug, version)
 *   401  missing or wrong `Authorization: Bearer <PUSH_DISPATCH_SECRET>`
 *   421  request resolved to a non-default tenant
 *   502  a store read or the catalog read failed, or the run failed
 *        unexpectedly; nothing was sent or recorded on a failed read
 *   503  secret, store, sender (VAPID) or opt-in not configured
 * (405 for any other method is Next's own.)
 *
 * A `200` with `counts.deferred > 0` or `stopped_early: true` means work is
 * left over: call the route again. It reuses the dispatch secret rather than
 * adding a second one; the opt-in flag is what separates the two routes.
 *
 * `runtime = "nodejs"`: `web-push` uses Node's `https` and `crypto`.
 * `maxDuration = 60`: `runPush` stops starting sends at 40 s
 * (`PUSH_RUN_BUDGET_MS`, which includes its own store reads) and needs one
 * more send deadline (10 s) at most to finish, so 60 s leaves a margin. Whether
 * the hosting plan allows 60 s is the operator's to check — Vercel clamps a
 * larger value to the plan's limit, and on a lower limit the run would be cut
 * off mid-way (safe: unrecorded baselines are simply planned again).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function sendEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PUSH_SEND_ENABLED === "true";
}

export async function POST(request: Request): Promise<Response> {
  const auth = await checkDispatchAuth(request.headers);
  if (!auth.ok) {
    return auth.status === 401
      ? errorResponse(401, "Unauthorized")
      : errorResponse(503, "Push sending is not available");
  }

  if (!sendEnabled() || !isPushStoreConfigured()) {
    return errorResponse(503, "Push sending is not available");
  }

  let catalog;
  try {
    catalog = await getDispatchCatalog();
  } catch (error) {
    if (error instanceof DispatchTenantError) {
      return errorResponse(421, "Sending is only available on the primary host");
    }
    return errorResponse(502, "Could not read the catalog");
  }

  const result = await runPush(catalog);
  if (!result.ok) {
    switch (result.reason) {
      case "not_configured":
      case "sender_not_configured":
        return errorResponse(503, "Push sending is not available");
      default:
        return errorResponse(502, "The push run could not complete");
    }
  }

  const { counts, stopped_early, anomaly, baseline_write } = result;
  return Response.json(
    { counts, stopped_early, anomaly, baseline_write },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
