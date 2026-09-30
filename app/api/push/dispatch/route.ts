import { checkRateLimit } from "../../../../lib/rate-limit";
import { DispatchTenantError, getDispatchCatalog } from "@/lib/catalog";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { checkDispatchAuth } from "@/lib/push-dispatch-auth";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { buildPlan } from "@/lib/push-plan";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { errorResponse } from "@/lib/push-request";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { isPushStoreConfigured, readDispatchState } from "@/lib/push-store";

/**
 * `POST /api/push/dispatch` — leaf `5.k.xiii.zi`. Computes, and returns, the
 * plan for the next Web Push run: which subscribed apps have a new version to
 * notify about, and which need a baseline recorded. **Read-only — it writes
 * nothing and sends nothing**, so it is safe to deploy before the sender
 * (`5.k.iii.zo`), which consumes exactly this plan.
 *
 * Order of work (each step short-circuits, nothing later runs after a failure):
 *   1. `checkDispatchAuth` — `401` (missing/wrong secret) or `503` (secret
 *      unset or too short: fails closed). Nothing else is read first.
 *   2. `isPushStoreConfigured` — `503` when the Supabase env vars are unset.
 *   3. `readDispatchState` — `503` if it reports not configured, `502` if
 *      any read was unavailable (partial or malformed reads included). A
 *      failed read is never planned against: an empty baseline set would
 *      plan a baseline write for every app.
 *   4. `getDispatchCatalog` — `421` for a non-default tenant, `502` for any
 *      other failure (including being called outside a request).
 *   5. `buildPlan` (pure) — `200 { notify, baseline, counts }`.
 *
 * Every error body is a fixed string: no tenant id, no slug, no upstream
 * message. The `200` body carries slugs, names and versions only — never a
 * push endpoint, a key, or a per-slug subscriber count.
 *
 * A plan with `counts.deferred > 0` means the run hit `MAX_PLAN`: call again.
 *
 * Worst-case latency is (1 + baseline batches) x 8 s of store reads, against
 * the platform's function limit — see `readDispatchState`.
 *
 * Statuses, for `5.k.iii.zo` and the operator:
 *   200  plan (possibly with empty lists)
 *   401  missing or wrong `Authorization: Bearer <PUSH_DISPATCH_SECRET>`
 *   421  request resolved to a non-default tenant (decision recorded in the
 *        leaf's Done note; 421 Misdirected Request, "use the primary host")
 *   502  a store read or the catalog read failed
 *   503  dispatch secret or store not configured
 * (405 for any other method is Next's own.)
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  // Auth first, before any other work. It is async; its 401/503 pass straight
  // through with fixed bodies.
  const auth = await checkDispatchAuth(request.headers);
  if (!auth.ok) {
    return auth.status === 401
      ? errorResponse(401, "Unauthorized")
      : errorResponse(503, "Push dispatch is not available");
  }

  if (!isPushStoreConfigured()) {
    return errorResponse(503, "Push dispatch is not available");
  }

  const state = await readDispatchState();
  if (!state.ok) {
    return state.reason === "not_configured"
      ? errorResponse(503, "Push dispatch is not available")
      : errorResponse(502, "Could not read the subscription state");
  }

  let catalog;
  try {
    catalog = await getDispatchCatalog();
  } catch (error) {
    if (error instanceof DispatchTenantError) {
      return errorResponse(421, "Dispatch is only available on the primary host");
    }
    return errorResponse(502, "Could not read the catalog");
  }

  // `state.baselines` is a real Map straight from `readDispatchState`.
  const plan = buildPlan(catalog, state.baselines, state.subscribedSlugs);
  return Response.json(plan, { status: 200, headers: { "Cache-Control": "no-store" } });
}
