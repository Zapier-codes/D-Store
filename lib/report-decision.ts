import { REPORT_DECISIONS, decideReport, type ReportStoreDeps } from "./report-store";

/**
 * Moderator decision on one report — leaf `3.c.viii.zo`. The route
 * (`app/api/moderation/reports/[id]/decision/route.ts`) is a thin wrapper; the
 * logic lives here so every status can be exercised over fakes, without Next
 * (the `lib/report-intake.ts` shape).
 *
 * `POST` body: `{ "decision": "no_action" | "relabel" | "remove" | "escalate" }`.
 * Nothing else is read: no note, and the moderator's id is never written or
 * returned (docs/MODERATION.md section 5, step 5).
 *
 * Order of work, each step short-circuits:
 *   1. the moderator guard (`requireModeratorRequest`) → its own `401` / `403` /
 *      `503`, returned as is, BEFORE anything else runs: no id check, no body
 *      read, no store call. The shared admin password does not pass it.
 *   2. id shape                → 404 (a malformed id can match nothing; the same
 *      answer `readReport` gives, and no request is made)
 *   3. body                    → 413 (too large) / 400 (not JSON, not an object,
 *      no `decision` string)
 *   4. `decideReport`          → closed 200, invalid 400, not_found 404,
 *      already_closed 409, not_configured 503, unavailable 502
 *
 * Every body is a fixed string (`{ "error": "..." }`, or `{ "ok": true,
 * "status": "closed", "decision": "<the one just recorded>" }` on success) and
 * every response is `Cache-Control: no-store`. Nothing here echoes the id, the
 * report's `details`, a key, a store error or the moderator's id, and nothing
 * here logs.
 *
 * Decision recorded: `already_closed` is `409`, not `200`. The caller learns
 * that someone else (or an earlier click) got there first, and the first
 * decision stands.
 */

export const DECISION_MAX_BODY_BYTES = 1024;

type GateResult = { ok: true; moderator: string } | { ok: false; response: Response };

export interface ReportDecisionDeps {
  /** The moderator guard. Production passes `requireModeratorRequest`. */
  requireModerator: (request: Request) => Promise<GateResult>;
  /** Defaults to the real store write. */
  decide?: typeof decideReport;
  /** Passed through to `decideReport` (env, fetch, clock). */
  storeDeps?: ReportStoreDeps;
}

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function respond(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

const fail = (status: number, error: string): Response => respond(status, { error });

export async function handleReportDecision(request: Request, id: unknown, deps: ReportDecisionDeps): Promise<Response> {
  // 1. Guard first. Its response is returned untouched.
  const gate = await deps.requireModerator(request);
  if (!gate.ok) return gate.response;

  // 2. Id shape.
  if (typeof id !== "string" || !ID_PATTERN.test(id)) return fail(404, "Report not found");

  // 3. Bounded JSON body.
  let payload: unknown;
  try {
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > DECISION_MAX_BODY_BYTES) return fail(413, "Request too large");
    const text = await request.text();
    if (text.length > DECISION_MAX_BODY_BYTES) return fail(413, "Request too large");
    payload = JSON.parse(text);
  } catch {
    return fail(400, "Invalid JSON body");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return fail(400, "Body must be a JSON object");
  }
  const { decision } = payload as { decision?: unknown };
  if (typeof decision !== "string") return fail(400, "Choose one of the listed decisions");

  // 4. The one write.
  const decide = deps.decide ?? decideReport;
  const result = await decide(id, decision, deps.storeDeps);
  if (result.ok) return respond(200, { ok: true, status: "closed", decision: result.report.decision });
  switch (result.reason) {
    case "invalid":
      return fail(400, `Choose one of: ${REPORT_DECISIONS.join(", ")}`);
    case "not_found":
      return fail(404, "Report not found");
    case "already_closed":
      return fail(409, "This report is already closed");
    case "not_configured":
      return fail(503, "Moderation is not available");
    default:
      return fail(502, "Could not record the decision");
  }
}
