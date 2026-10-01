import { randomUUID } from "node:crypto";
import { checkRateLimit, rateLimitKey, tooManyRequests } from "./rate-limit";

/**
 * Anonymous report intake — leaves `3.c.iii.zi` part 1 and `3.c.v.zo`. The
 * route (`app/api/apps/[slug]/reports/route.ts`) is a thin wrapper; the logic
 * lives here so every status can be tested over fakes, without Next.
 *
 * Body: `{ "reason": <one of REASONS>, "details"?: string }`.
 *
 * Order of work, each step short-circuits:
 *   1. slug shape              → 400
 *   2. Supabase configured     → 503 (a report is never "accepted" and dropped)
 *   3. throttle, fail-closed   → 429 (5 per hour per hashed client address; the
 *      bucket key carries no slug, and this route writes to a table)
 *   4. body                    → 413 (too large) / 400 (not a JSON object, bad
 *      reason, bad details)
 *   5. slug against the catalog → 404 (no such app) / 502 (catalog unreadable)
 *      — `3.c.v.zo`: this used to look the slug up in `public.application`,
 *      which nothing fills, so every report answered 404. The catalog is the
 *      source of truth (`getMergedApps()`, via `catalogHasSlug`).
 *   6. insert with a generated `id` (`report_flag.id` has no default),
 *      `app_slug` set and `application_id` left out (null) → 502 on failure,
 *      else 200 `{ ok: true }`. Needs migration `20261001010000`.
 *
 * No IP is stored on the report (by design, docs/MODERATION.md); the throttle
 * keeps only a salted hash, in a separate table, for its window. Nothing here
 * logs a slug list, a body, a key or a response body.
 */

/** Must match the options in `components/ReportAppForm.tsx`. */
export const REPORT_REASONS = [
  "Broken download link",
  "Malware or security concern",
  "Inappropriate content",
  "Copyright / DMCA issue",
  "Other",
] as const;

export const REPORT_SLUG_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
export const REPORT_MAX_BODY_BYTES = 8 * 1024;
export const REPORT_MAX_DETAILS = 2000;

export interface ReportIntakeDeps {
  /** Does the request's catalog contain this slug? May throw. */
  catalogHasSlug: (slug: string) => Promise<boolean>;
  /** Defaults to the shared limiter. Returns false when throttled. */
  checkRateLimit?: typeof checkRateLimit;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  newId?: () => string;
}

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handleReport(request: Request, slug: unknown, deps: ReportIntakeDeps): Promise<Response> {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const limiter = deps.checkRateLimit ?? checkRateLimit;
  const newId = deps.newId ?? randomUUID;

  if (typeof slug !== "string" || !REPORT_SLUG_PATTERN.test(slug)) return fail(400, "Invalid app");

  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return fail(503, "Reporting is not available");

  if (!(await limiter(rateLimitKey("report", request.headers, env), 5, 3600, { failOpen: false, fetchImpl, env }))) {
    return tooManyRequests();
  }

  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > REPORT_MAX_BODY_BYTES) return fail(413, "Request too large");
    payload = JSON.parse(text);
  } catch {
    return fail(400, "Invalid JSON body");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return fail(400, "Body must be a JSON object");
  }
  const { reason, details } = payload as { reason?: unknown; details?: unknown };
  if (typeof reason !== "string" || !(REPORT_REASONS as readonly string[]).includes(reason)) {
    return fail(400, "Choose one of the listed reasons");
  }
  if (details !== undefined && details !== null && typeof details !== "string") {
    return fail(400, "Details must be text");
  }
  const cleanDetails = typeof details === "string" ? details.trim().slice(0, REPORT_MAX_DETAILS) || null : null;

  let known: boolean;
  try {
    known = await deps.catalogHasSlug(slug);
  } catch {
    return fail(502, "Could not save the report");
  }
  if (!known) return fail(404, "App not found");

  try {
    const insert = await fetchImpl(`${url}/rest/v1/report_flag`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: newId(),
        app_slug: slug,
        reason,
        details: cleanDetails,
        status: "open",
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!insert.ok) return fail(502, "Could not save the report");
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail(502, "Could not save the report");
  }
}
