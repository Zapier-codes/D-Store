import { checkRateLimit, rateLimitKey, tooManyRequests } from "@/lib/rate-limit";
import { deleteSubscription, isPushStoreConfigured } from "@/lib/push-store";
import { validateEndpoint } from "@/lib/push-validate";
import {
  UNSUBSCRIBE_MAX_BODY_BYTES,
  errorResponse,
  noContent,
  readJsonBody,
} from "@/lib/push-request";

/**
 * `POST /api/push/unsubscribe` — leaf `5.k.vi.zi`. Removes a device's
 * subscription and, by cascade, its slug set.
 *
 * Body: `{ "endpoint": string }`.
 *
 * Responses — none echoes the endpoint:
 *   204  removed, OR there was nothing stored for that endpoint (deliberately
 *        the same, so this route cannot be used to probe which endpoints exist)
 *   400  invalid JSON, or the endpoint fails `validateEndpoint`
 *   413 / 415 / 502 / 503  as for `/api/push/subscribe`
 *
 * Anyone who knows an endpoint can unsubscribe it. That is inherent to an
 * account-less design and low-stakes: the endpoint is a secret URL only the
 * device and the push service hold, and the worst outcome is a device
 * silently losing alerts it can switch back on.
 *
 * Throttled like the subscribe route (`5.k.vi.zo`): 10 requests per 10
 * minutes per hashed client address, fail-closed, `429` when over.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isPushStoreConfigured()) return errorResponse(503, "Push notifications are not available");

  if (!(await checkRateLimit(rateLimitKey("push-unsubscribe", request.headers), 10, 600, { failOpen: false }))) {
    return tooManyRequests();
  }

  const body = await readJsonBody(request, UNSUBSCRIBE_MAX_BODY_BYTES);
  if (!body.ok) return errorResponse(body.status, body.error);

  const envelope = body.value;
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) {
    return errorResponse(400, "Body must be a JSON object");
  }
  const endpoint = validateEndpoint((envelope as { endpoint?: unknown }).endpoint);
  if (!endpoint.ok) return errorResponse(400, endpoint.error);

  const result = await deleteSubscription(endpoint.value);
  if (result.ok) return noContent();
  if (result.reason === "not_configured") {
    return errorResponse(503, "Push notifications are not available");
  }
  return errorResponse(502, "Could not remove the subscription");
}
