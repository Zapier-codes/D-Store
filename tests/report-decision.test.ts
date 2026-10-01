import assert from "node:assert/strict";
import test from "node:test";
import { DECISION_MAX_BODY_BYTES, handleReportDecision, type ReportDecisionDeps } from "../lib/report-decision";
import type { DecideReportResult } from "../lib/report-store";

// Leaf 3.c.viii.zo. Written without being run, at the operator's request.

const ID = "11111111-1111-4111-8111-111111111111";
const closedRow = (decision: string) => ({
  id: ID,
  app_slug: "whatsapp",
  application_id: null,
  reason: "Other",
  status: "closed",
  decision,
  decided_at: "2026-10-02T09:30:00.000Z",
  created_at: "2026-10-01T12:00:00.000000+00:00",
});

function setup(result: DecideReportResult | (() => DecideReportResult), gateOk = true) {
  const calls = { gate: 0, decide: [] as unknown[][] };
  const deps: ReportDecisionDeps = {
    requireModerator: async () => {
      calls.gate += 1;
      return gateOk
        ? { ok: true, moderator: "alice" }
        : { ok: false, response: new Response("Authentication required", { status: 401, headers: { "WWW-Authenticate": "Basic" } }) };
    },
    decide: (async (...args: unknown[]) => {
      calls.decide.push(args);
      return typeof result === "function" ? result() : result;
    }) as ReportDecisionDeps["decide"],
  };
  return { calls, deps };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://store.invalid/api/moderation/reports/x/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

test("closed is 200 with a fixed body: the decision and nothing else (no id, details, moderator)", async () => {
  const s = setup({ ok: true, report: closedRow("remove") as never });
  const res = await handleReportDecision(post({ decision: "remove" }), ID, s.deps);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await res.json(), { ok: true, status: "closed", decision: "remove" });
  assert.deepEqual(s.calls.decide, [[ID, "remove", undefined]]);
});

test("each store result maps to its fixed status and body", async () => {
  const table: Array<[DecideReportResult, number, string]> = [
    [{ ok: false, reason: "invalid" }, 400, "Choose one of: no_action, relabel, remove, escalate"],
    [{ ok: false, reason: "not_found" }, 404, "Report not found"],
    [{ ok: false, reason: "already_closed" }, 409, "This report is already closed"],
    [{ ok: false, reason: "not_configured" }, 503, "Moderation is not available"],
    [{ ok: false, reason: "unavailable" }, 502, "Could not record the decision"],
  ];
  for (const [result, status, error] of table) {
    const res = await handleReportDecision(post({ decision: "no_action" }), ID, setup(result).deps);
    assert.equal(res.status, status, result.ok ? "ok" : result.reason);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await res.json(), { error });
  }
});

test("the guard refuses before anything else runs: no id check, no body read, no store call", async () => {
  const s = setup({ ok: true, report: closedRow("remove") as never }, false);
  const req = post({ decision: "remove" });
  const res = await handleReportDecision(req, "bad id!", s.deps);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("WWW-Authenticate"), "Basic");
  assert.equal(req.bodyUsed, false);
  assert.equal(s.calls.decide.length, 0);
});

test("401, 403 and 503 from the guard are returned as they are", async () => {
  for (const status of [401, 403, 503]) {
    const deps: ReportDecisionDeps = {
      requireModerator: async () => ({ ok: false, response: new Response("denied", { status }) }),
      decide: (async () => {
        throw new Error("must not be called");
      }) as ReportDecisionDeps["decide"],
    };
    const res = await handleReportDecision(post({ decision: "remove" }), ID, deps);
    assert.equal(res.status, status);
    assert.equal(await res.text(), "denied");
  }
});

test("the shared admin password does not pass the real guard (401, no store call)", async () => {
  const { requireModeratorRequest } = await import("../lib/moderator-gate");
  const saved = process.env.MODERATOR_TOKENS;
  process.env.MODERATOR_TOKENS = JSON.stringify([{ id: "alice", sha256: "0".repeat(64) }]);
  try {
    let called = 0;
    const deps: ReportDecisionDeps = {
      requireModerator: requireModeratorRequest,
      decide: (async () => {
        called += 1;
        return { ok: false, reason: "unavailable" };
      }) as ReportDecisionDeps["decide"],
    };
    const adminBasic = "Basic " + Buffer.from("admin:the-shared-admin-password").toString("base64");
    const res = await handleReportDecision(post({ decision: "remove" }, { Authorization: adminBasic }), ID, deps);
    assert.ok(res.status === 401 || res.status === 403, String(res.status));
    assert.equal(called, 0);
  } finally {
    if (saved === undefined) delete process.env.MODERATOR_TOKENS;
    else process.env.MODERATOR_TOKENS = saved;
  }
});

test("a malformed id is 404 with no body read and no store call", async () => {
  for (const id of ["", "a b", "a/b", "x".repeat(129), undefined, 5, null, "a&status=neq.open"]) {
    const s = setup({ ok: true, report: closedRow("remove") as never });
    const req = post({ decision: "remove" });
    const res = await handleReportDecision(req, id, s.deps);
    assert.equal(res.status, 404, String(id));
    assert.equal(req.bodyUsed, false);
    assert.equal(s.calls.decide.length, 0);
  }
});

test("body: too large is 413; not JSON, not an object, or no string decision is 400; none reach the store", async () => {
  const cases: Array<[Request, number]> = [
    [post("x".repeat(DECISION_MAX_BODY_BYTES + 1)), 413],
    [post({ decision: "remove" }, { "Content-Length": String(DECISION_MAX_BODY_BYTES + 1) }), 413],
    [post("not json"), 400],
    [post(""), 400],
    [post("[]"), 400],
    [post("null"), 400],
    [post("5"), 400],
    [post({}), 400],
    [post({ decision: 5 }), 400],
    [post({ decision: null }), 400],
    [post({ decision: ["remove"] }), 400],
  ];
  for (const [req, status] of cases) {
    const s = setup({ ok: true, report: closedRow("remove") as never });
    const res = await handleReportDecision(req, ID, s.deps);
    assert.equal(res.status, status);
    assert.equal(s.calls.decide.length, 0);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
  }
});

test("extra body keys (a note, a moderator id) are ignored: only the id and the decision reach the store", async () => {
  const s = setup({ ok: true, report: closedRow("escalate") as never });
  const res = await handleReportDecision(post({ decision: "escalate", note: "secret note", moderator: "mallory", details: "x" }), ID, s.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(s.calls.decide, [[ID, "escalate", undefined]]);
  assert.ok(!JSON.stringify(await res.clone().json()).includes("note"));
});

test("a bad decision string goes to the store, which answers invalid, which is 400", async () => {
  const s = setup({ ok: false, reason: "invalid" });
  const res = await handleReportDecision(post({ decision: "delete" }), ID, s.deps);
  assert.equal(res.status, 400);
  assert.equal(s.calls.decide.length, 1);
});

test("end to end over a fake PostgREST: first decision 200, second 409, and the PATCH carries status=eq.open", async () => {
  const state = { status: "open", decision: null as string | null };
  const seen: string[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    seen.push(`${init.method} ${new URL(String(url)).search}`);
    if (init.method === "PATCH" && state.status === "open" && new URL(String(url)).searchParams.get("status") === "eq.open") {
      const b = JSON.parse(String(init.body));
      state.status = b.status;
      state.decision = b.decision;
      return Response.json([{ ...closedRow(b.decision), decided_at: b.decided_at }]);
    }
    if (init.method === "PATCH") return Response.json([]);
    return Response.json([{ ...closedRow(state.decision ?? "x"), status: state.status, details: null }]);
  }) as typeof fetch;
  const deps: ReportDecisionDeps = {
    requireModerator: async () => ({ ok: true, moderator: "alice" }),
    storeDeps: { env: { SUPABASE_URL: "https://x.supabase.invalid", SUPABASE_SERVICE_ROLE_KEY: "k" }, fetch: impl, timeoutMs: 500 },
  };
  assert.equal((await handleReportDecision(post({ decision: "no_action" }), ID, deps)).status, 200);
  assert.equal((await handleReportDecision(post({ decision: "remove" }), ID, deps)).status, 409);
  assert.equal(state.decision, "no_action");
  assert.ok(seen[0].includes("status=eq.open"));
});
