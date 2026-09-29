import { isPushStoreConfigured, upsertSubscription } from "@/lib/push-store";
import { validatePushSubscription, validateSlugs } from "@/lib/push-validate";
import {
  SUBSCRIBE_MAX_BODY_BYTES,
  errorResponse,
  noContent,
  readJsonBody,
} from "@/lib/push-request";

/**
 * `POST /api/push/subscribe` — leaf `5.k.vi.zi`. Registers (or refreshes) a
 * device's Web Push subscription and REPLACES the set of apps it wants
 * update alerts for. Calling it again with a different slug list is how the
 * client re-syncs when favorites change (`5.k.ii.zi`).
 *
 * Body: `{ "subscription": PushSubscription.toJSON(), "slugs": string[] }`.
 * `slugs` is required (an empty array is valid: subscribed to nothing).
 *
 * Responses — none of them ever echoes the endpoint or the keys:
 *   204  stored
 *   400  invalid JSON or failed validation (`lib/push-validate.ts`; the
 *        messages are fixed strings)
 *   413  body over 32 KiB
 *   415  Content-Type is not application/json
 *   502  the store was configured but the request to it failed
 *   503  `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` unset or unusable —
 *        checked first, before the body is read
 * (405 for any other method is Next's own.)
 *
 * NOT throttled — `5.k.vi.zo` is Held. Until it lands,
 * `SUPABASE_SERVICE_ROLE_KEY` must stay unset in production, which makes this
 * route answer 503 and write nothing.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isPushStoreConfigured()) return errorResponse(503, "Push notifications are not available");

  const body = await readJsonBody(request, SUBSCRIBE_MAX_BODY_BYTES);
  if (!body.ok) return errorResponse(body.status, body.error);

  const envelope = body.value;
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) {
    return errorResponse(400, "Body must be a JSON object");
  }
  const { subscription, slugs } = envelope as { subscription?: unknown; slugs?: unknown };

  const sub = validatePushSubscription(subscription);
  if (!sub.ok) return errorResponse(400, sub.error);
  const list = validateSlugs(slugs);
  if (!list.ok) return errorResponse(400, list.error);

  const result = await upsertSubscription(sub.value, list.value);
  if (result.ok) return noContent();
  if (result.reason === "not_configured") {
    return errorResponse(503, "Push notifications are not available");
  }
  return errorResponse(502, "Could not save the subscription");
}
