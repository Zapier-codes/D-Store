import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitKey, tooManyRequests } from "@/lib/rate-limit";

/**
 * Anonymous report intake — leaf `3.c.iii.zi`, first of its three parts (the
 * moderator auth and the queue UI are still open; see HANDOVER.md).
 *
 * Body: `{ "reason": <one of REASONS>, "details"?: string }`.
 *
 * Order of work, each step short-circuits:
 *   1. slug shape            → 400
 *   2. Supabase configured   → 503 (a report is never "accepted" and dropped)
 *   3. throttle, fail-closed → 429 (5 per hour per hashed client address; the
 *      bucket key carries no slug, and this route writes to a table)
 *   4. body                  → 400
 *   5. look the app up by slug → 404 (unknown app) / 502 (lookup failed).
 *      `report_flag.application_id` references `application.id`, which is a
 *      different column from `slug`, so the slug is resolved first.
 *   6. insert with a generated `id` (`report_flag.id` has no default) → 502 on
 *      failure, else 200 `{ ok: true }`.
 *
 * No IP is stored on the report (by design, docs/MODERATION.md); the throttle
 * keeps only a salted hash, in a separate table, for its window.
 */

/** Must match the options in `components/ReportAppForm.tsx`. */
const REASONS = [
  "Broken download link",
  "Malware or security concern",
  "Inappropriate content",
  "Copyright / DMCA issue",
  "Other",
] as const;

const SLUG_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_DETAILS = 2000;

function fail(status: number, error: string): Response {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) return fail(400, "Invalid app");

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return fail(503, "Reporting is not available");

  if (!(await checkRateLimit(rateLimitKey("report", request.headers), 5, 3600, { failOpen: false }))) {
    return tooManyRequests();
  }

  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return fail(413, "Request too large");
    payload = JSON.parse(text);
  } catch {
    return fail(400, "Invalid JSON body");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return fail(400, "Body must be a JSON object");
  }
  const { reason, details } = payload as { reason?: unknown; details?: unknown };
  if (typeof reason !== "string" || !(REASONS as readonly string[]).includes(reason)) {
    return fail(400, "Choose one of the listed reasons");
  }
  if (details !== undefined && details !== null && typeof details !== "string") {
    return fail(400, "Details must be text");
  }
  const cleanDetails = typeof details === "string" ? details.trim().slice(0, MAX_DETAILS) || null : null;

  const headers = {
    "Content-Type": "application/json",
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };

  try {
    const lookup = await fetch(
      `${url}/rest/v1/application?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`,
      { headers, signal: AbortSignal.timeout(5000) },
    );
    if (!lookup.ok) return fail(502, "Could not save the report");
    const rows: unknown = await lookup.json();
    const applicationId =
      Array.isArray(rows) && typeof (rows[0] as { id?: unknown } | undefined)?.id === "string"
        ? (rows[0] as { id: string }).id
        : null;
    if (!applicationId) return fail(404, "App not found");

    const insert = await fetch(`${url}/rest/v1/report_flag`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        id: randomUUID(),
        application_id: applicationId,
        reason,
        details: cleanDetails,
        status: "open",
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!insert.ok) return fail(502, "Could not save the report");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail(502, "Could not save the report");
  }
}
