import assert from "node:assert/strict";
import test from "node:test";
import {
  REPORT_PAGE_DEFAULT,
  REPORT_PAGE_MAX,
  REPORT_STORE_MAX_BODY_BYTES,
  REPORT_DECISIONS,
  decideReport,
  decodeReportCursor,
  encodeReportCursor,
  isReportStoreConfigured,
  readReport,
  readReports,
  type ReportStoreDeps,
} from "../lib/report-store";

// Leaf 3.c.vii.zo (reads) and 3.c.viii.zi (decideReport).

const ENV = { SUPABASE_URL: "https://x.supabase.invalid", SUPABASE_SERVICE_ROLE_KEY: "svc-key-secret" };
const T = "2026-10-01T12:00:00.123456+00:00";

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    app_slug: "whatsapp",
    application_id: null,
    reason: "Broken download link",
    status: "open",
    decision: null,
    decided_at: null,
    created_at: T,
    ...over,
  };
}

interface Seen {
  url: string;
  init: RequestInit;
}

function fake(respond: (n: number) => Response | Promise<Response> | Error) {
  const seen: Seen[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    seen.push({ url: String(url), init });
    const r = await respond(seen.length);
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  const deps: ReportStoreDeps = { env: ENV, fetch: impl, timeoutMs: 500 };
  return { seen, deps };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const params = (s: Seen) => new URL(s.url).searchParams;

// Silence the fixed one-line failure logs while the tests provoke them.
const realError = console.error;
test.before(() => {
  console.error = () => undefined;
});
test.after(() => {
  console.error = realError;
});

test("isReportStoreConfigured: needs both, https or loopback http", () => {
  assert.equal(isReportStoreConfigured(ENV), true);
  assert.equal(isReportStoreConfigured({ SUPABASE_URL: "https://x" }), false);
  assert.equal(isReportStoreConfigured({ ...ENV, SUPABASE_URL: "http://example.com" }), false);
  assert.equal(isReportStoreConfigured({ ...ENV, SUPABASE_URL: "http://127.0.0.1:54321" }), true);
  assert.equal(isReportStoreConfigured({ ...ENV, SUPABASE_URL: "https://u:p@x.invalid" }), false);
  assert.equal(isReportStoreConfigured({ ...ENV, SUPABASE_URL: "not a url" }), false);
});

test("cursor: round-trips and rejects anything malformed without throwing", () => {
  const c = { created_at: T, id: "abc-1" };
  assert.deepEqual(decodeReportCursor(encodeReportCursor(c)), c);
  assert.match(encodeReportCursor(c), /^[A-Za-z0-9_-]+$/);
  for (const bad of [undefined, null, 5, "", "!!!", "x".repeat(600), Buffer.from("[]").toString("base64url"), Buffer.from('{"t":"nope","i":"a"}').toString("base64url"), Buffer.from(`{"t":"${T}","i":"a b"}`).toString("base64url"), Buffer.from(`{"t":"${T}","i":"\\"),x"}`).toString("base64url")]) {
    assert.equal(decodeReportCursor(bad), null, String(bad));
  }
});

test("readReports: not_configured makes no request", async () => {
  const f = fake(() => json([]));
  const r = await readReports({ status: "open" }, { ...f.deps, env: {} });
  assert.deepEqual(r, { ok: false, reason: "not_configured" });
  assert.equal(f.seen.length, 0);
});

test("readReports: invalid status or cursor is invalid_input, before any request", async () => {
  const f = fake(() => json([]));
  for (const o of [
    { status: "all" },
    { status: undefined },
    { status: "open", cursor: { created_at: "yesterday", id: "a" } },
    { status: "open", cursor: { created_at: T, id: "a b" } },
  ]) {
    const r = await readReports(o as never, f.deps);
    assert.deepEqual(r, { ok: false, reason: "invalid_input" });
  }
  assert.equal(f.seen.length, 0);
});

test("readReports: open request shape (GET, columns, filter, order, limit+1, no details, no application)", async () => {
  const f = fake(() => json([row()]));
  const r = await readReports({ status: "open", limit: 10 }, f.deps);
  assert.equal(r.ok, true);
  assert.equal(f.seen.length, 1);
  const s = f.seen[0];
  const u = new URL(s.url);
  assert.equal(u.origin, "https://x.supabase.invalid");
  assert.equal(u.pathname, "/rest/v1/report_flag");
  assert.equal(s.init.method, "GET");
  assert.equal(s.init.redirect, "error");
  assert.equal(s.init.cache, "no-store");
  const p = params(s);
  assert.equal(p.get("status"), "eq.open");
  assert.equal(p.get("order"), "created_at.desc,id.desc");
  assert.equal(p.get("limit"), "11");
  assert.equal(p.get("or"), null);
  const cols = (p.get("select") ?? "").split(",");
  assert.ok(!cols.includes("details"));
  for (const c of ["id", "app_slug", "application_id", "reason", "status", "decision", "decided_at", "created_at"]) assert.ok(cols.includes(c), c);
  assert.ok(!s.url.includes("application?") && !s.url.includes("/application"));
  const h = s.init.headers as Record<string, string>;
  assert.equal(h.apikey, "svc-key-secret");
  assert.equal(h.Authorization, "Bearer svc-key-secret");
});

test("readReports: closed means status <> open", async () => {
  const f = fake(() => json([]));
  await readReports({ status: "closed" }, f.deps);
  assert.equal(params(f.seen[0]).get("status"), "neq.open");
});

test("readReports: limit is clamped, default applies to junk", async () => {
  const f = fake(() => json([]));
  await readReports({ status: "open" }, f.deps);
  await readReports({ status: "open", limit: 0 }, f.deps);
  await readReports({ status: "open", limit: 5000 }, f.deps);
  await readReports({ status: "open", limit: Number.NaN }, f.deps);
  await readReports({ status: "open", limit: 7.9 }, f.deps);
  const limits = f.seen.map((s) => params(s).get("limit"));
  assert.deepEqual(limits, [String(REPORT_PAGE_DEFAULT + 1), "2", String(REPORT_PAGE_MAX + 1), String(REPORT_PAGE_DEFAULT + 1), "8"]);
});

test("readReports: cursor becomes a quoted keyset filter", async () => {
  const f = fake(() => json([]));
  await readReports({ status: "open", cursor: { created_at: T, id: "abc" } }, f.deps);
  assert.equal(params(f.seen[0]).get("or"), `(created_at.lt."${T}",and(created_at.eq."${T}",id.lt."abc"))`);
});

test("readReports: parses rows, new and legacy, decided and open", async () => {
  const rows = [
    row({ id: "a1" }),
    row({ id: "a2", app_slug: null, application_id: "legacy-7" }),
    row({ id: "a3", status: "closed", decision: "remove", decided_at: "2026-10-02T08:00:00Z" }),
  ];
  const f = fake(() => json(rows));
  const r = await readReports({ status: "open" }, f.deps);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.reports.map((x) => x.id), ["a1", "a2", "a3"]);
  assert.equal(r.reports[1].app_slug, null);
  assert.equal(r.reports[1].application_id, "legacy-7");
  assert.equal(r.reports[2].decision, "remove");
  assert.equal(r.next_cursor, null);
  assert.ok(!("details" in r.reports[0]));
});

test("readReports: one extra row means a next page, trimmed, with the cursor of the last kept row", async () => {
  const rows = [row({ id: "a1" }), row({ id: "a2", created_at: "2026-10-01T11:00:00+00:00" }), row({ id: "a3", created_at: "2026-10-01T10:00:00+00:00" })];
  const f = fake(() => json(rows));
  const r = await readReports({ status: "open", limit: 2 }, f.deps);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.reports.length, 2);
  assert.deepEqual(r.next_cursor, { created_at: "2026-10-01T11:00:00+00:00", id: "a2" });
});

test("readReports: exactly a full page with no extra row has no next page", async () => {
  const f = fake(() => json([row({ id: "a1" }), row({ id: "a2" })]));
  const r = await readReports({ status: "open", limit: 2 }, f.deps);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.next_cursor, null);
});

test("readReports: more rows than asked for is unavailable", async () => {
  const f = fake(() => json([row({ id: "a1" }), row({ id: "a2" }), row({ id: "a3" })]));
  assert.deepEqual(await readReports({ status: "open", limit: 1 }, f.deps), { ok: false, reason: "unavailable" });
});

test("readReports: every kind of bad row makes the whole page unavailable", async () => {
  const bad: Record<string, unknown>[] = [
    { id: "a b" },
    { id: 5 },
    { app_slug: "has space" },
    { app_slug: 3 },
    { application_id: "x y" },
    { app_slug: null, application_id: null },
    { reason: "" },
    { reason: 4 },
    { reason: "r".repeat(201) },
    { status: "" },
    { decision: "ban" },
    { decision: 1 },
    { decided_at: "soon" },
    { created_at: "2026-13-45T99:99:99Z" },
    { created_at: null },
  ];
  for (const over of bad) {
    const f = fake(() => json([row({ id: "good" }), row(over)]));
    assert.deepEqual(await readReports({ status: "open" }, f.deps), { ok: false, reason: "unavailable" }, JSON.stringify(over));
  }
  for (const body of [{}, "x", null, [null], [5], [[]]]) {
    const f = fake(() => json(body));
    assert.deepEqual(await readReports({ status: "open" }, f.deps), { ok: false, reason: "unavailable" }, JSON.stringify(body));
  }
});

test("readReports: a missing decision column (migration not applied) is unavailable, not an empty list", async () => {
  const f = fake(() => json({ code: "42703", message: "column report_flag.decision does not exist" }, 400));
  assert.deepEqual(await readReports({ status: "open" }, f.deps), { ok: false, reason: "unavailable" });
});

test("readReports: non-2xx, network error, redirect and non-JSON are unavailable; no body or key is logged", async () => {
  const logged: string[] = [];
  console.error = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
  try {
    for (const r of [() => json([], 500), () => json([], 302), () => new Error("connect https://x.supabase.invalid svc-key-secret"), () => new Response("<html>", { status: 200 })]) {
      const f = fake(r);
      assert.deepEqual(await readReports({ status: "open" }, f.deps), { ok: false, reason: "unavailable" });
    }
    assert.ok(logged.length >= 4);
    for (const line of logged) {
      assert.match(line, /^report-store: readReports failed, /);
      assert.ok(!line.includes("svc-key-secret") && !line.includes("supabase.invalid"));
    }
  } finally {
    console.error = () => undefined;
  }
});

test("readReports: a body over the cap is unavailable, by declared length and by streamed length", async () => {
  const declared = fake(() => new Response("[]", { status: 200, headers: { "content-length": String(REPORT_STORE_MAX_BODY_BYTES + 1) } }));
  assert.deepEqual(await readReports({ status: "open" }, declared.deps), { ok: false, reason: "unavailable" });
  const streamed = fake(() => new Response(" ".repeat(REPORT_STORE_MAX_BODY_BYTES + 10) + "[]", { status: 200 }));
  assert.deepEqual(await readReports({ status: "open" }, streamed.deps), { ok: false, reason: "unavailable" });
});

test("readReports: a hung request times out as unavailable", async () => {
  const hang = ((_u: string, init: RequestInit) =>
    new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as unknown as typeof fetch;
  const r = await readReports({ status: "open" }, { env: ENV, fetch: hang, timeoutMs: 20 });
  assert.deepEqual(r, { ok: false, reason: "unavailable" });
});

test("readReport: returns the full row with details, capped; request asks for details and one id", async () => {
  const f = fake(() => json([{ ...row({ id: "r-1" }), details: "d".repeat(2500) }]));
  const r = await readReport("r-1", f.deps);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.report.id, "r-1");
  assert.equal(r.report.details?.length, 2000);
  const p = params(f.seen[0]);
  assert.equal(p.get("id"), "eq.r-1");
  assert.ok((p.get("select") ?? "").split(",").includes("details"));
  assert.equal(new URL(f.seen[0].url).pathname, "/rest/v1/report_flag");
});

test("readReport: null details stay null; markup in details is returned as inert text, unchanged", async () => {
  const hostile = '<script>alert(1)</script><a href="javascript:x">y</a>';
  const a = await readReport("r-1", fake(() => json([{ ...row({ id: "r-1" }), details: null }])).deps);
  assert.ok(a.ok && a.report.details === null);
  const b = await readReport("r-1", fake(() => json([{ ...row({ id: "r-1" }), details: hostile }])).deps);
  assert.ok(b.ok && b.report.details === hostile);
});

test("readReport: bad id is not_found with no request; unknown id is not_found", async () => {
  const f = fake(() => json([]));
  for (const id of ["", "a b", "a/b", "x".repeat(129), undefined, 5, null, "a,b", "a&id=eq.b"]) {
    assert.deepEqual(await readReport(id, f.deps), { ok: false, reason: "not_found" }, String(id));
  }
  assert.equal(f.seen.length, 0);
  assert.deepEqual(await readReport("missing", f.deps), { ok: false, reason: "not_found" });
  assert.equal(f.seen.length, 1);
});

test("readReport: not_configured; more than one row; a different id back; bad details type; failures are unavailable", async () => {
  const f = fake(() => json([]));
  assert.deepEqual(await readReport("r-1", { ...f.deps, env: {} }), { ok: false, reason: "not_configured" });
  assert.equal(f.seen.length, 0);
  const many = fake(() => json([{ ...row({ id: "r-1" }), details: null }, { ...row({ id: "r-1" }), details: null }]));
  assert.deepEqual(await readReport("r-1", many.deps), { ok: false, reason: "unavailable" });
  const other = fake(() => json([{ ...row({ id: "r-2" }), details: null }]));
  assert.deepEqual(await readReport("r-1", other.deps), { ok: false, reason: "unavailable" });
  const badDetails = fake(() => json([{ ...row({ id: "r-1" }), details: 5 }]));
  assert.deepEqual(await readReport("r-1", badDetails.deps), { ok: false, reason: "unavailable" });
  const noDetailsKey = fake(() => json([row({ id: "r-1" })]));
  assert.deepEqual(await readReport("r-1", noDetailsKey.deps), { ok: false, reason: "unavailable" });
  const down = fake(() => json([], 503));
  assert.deepEqual(await readReport("r-1", down.deps), { ok: false, reason: "unavailable" });
});

// --- decideReport (leaf 3.c.viii.zi) ---------------------------------------

const ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-02T09:30:00.000Z");

/**
 * A one-row PostgREST stand-in. PATCH applies the update only to rows that match EVERY
 * filter in the query string (here `id=eq.` and `status=eq.open`), exactly as PostgREST
 * does, and answers the changed rows; GET answers the row by id. If the status filter is
 * ever dropped from the request, a second PATCH would succeed and the tests below fail.
 */
function store(initial: Record<string, unknown> | null = row({ id: ID })) {
  const state = { row: initial ? { ...initial } : null };
  const seen: Seen[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    seen.push({ url: String(url), init });
    const q = new URL(String(url)).searchParams;
    const eq = (k: string) => (q.get(k) ?? "").replace(/^eq\./, "");
    const matches = state.row !== null && (!q.has("id") || state.row.id === eq("id")) && (!q.has("status") || state.row.status === eq("status"));
    if (init.method === "PATCH") {
      if (!matches || !state.row) return json([]);
      state.row = { ...state.row, ...JSON.parse(String(init.body)) };
      return json([state.row]);
    }
    return json(state.row && state.row.id === eq("id") ? [{ ...state.row, details: null }] : []);
  }) as typeof fetch;
  const deps: ReportStoreDeps = { env: ENV, fetch: impl, timeoutMs: 500, now: () => NOW };
  return { seen, state, deps };
}

test("decideReport: closes an open report; one PATCH with the id AND status=open in the filter, and only three fields written", async () => {
  const s = store();
  const r = await decideReport(ID, "relabel", s.deps);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.report.id, ID);
  assert.equal(r.report.status, "closed");
  assert.equal(r.report.decision, "relabel");
  assert.equal(r.report.decided_at, NOW.toISOString());
  assert.equal(s.seen.length, 1);
  const req = s.seen[0];
  const u = new URL(req.url);
  assert.equal(u.origin, "https://x.supabase.invalid");
  assert.equal(u.pathname, "/rest/v1/report_flag");
  assert.equal(req.init.method, "PATCH");
  assert.equal(u.searchParams.get("id"), `eq.${ID}`);
  assert.equal(u.searchParams.get("status"), "eq.open");
  assert.equal(u.searchParams.get("select"), "id,app_slug,application_id,reason,status,decision,decided_at,created_at");
  const h = req.init.headers as Record<string, string>;
  assert.equal(h.Prefer, "return=representation");
  assert.equal(h["Content-Type"], "application/json");
  assert.equal(h.apikey, "svc-key-secret");
  assert.equal(h.Authorization, "Bearer svc-key-secret");
  assert.equal(req.init.redirect, "error");
  // Exactly status, decision, decided_at: no note, no moderator id, nothing else.
  assert.deepEqual(JSON.parse(String(req.init.body)), { status: "closed", decision: "relabel", decided_at: NOW.toISOString() });
  assert.ok(!u.pathname.includes("application"), "no request goes to the application table");
});

test("decideReport: each of the four decisions is accepted and written as given", async () => {
  assert.deepEqual([...REPORT_DECISIONS], ["no_action", "relabel", "remove", "escalate"]);
  for (const d of REPORT_DECISIONS) {
    const s = store();
    const r = await decideReport(ID, d, s.deps);
    assert.equal(r.ok, true, d);
    assert.equal(JSON.parse(String(s.seen[0].init.body)).decision, d);
  }
});

test("decideReport: a second call after a first closed is already_closed, via a follow-up read, and changes nothing", async () => {
  const s = store();
  assert.equal((await decideReport(ID, "no_action", s.deps)).ok, true);
  const before = JSON.stringify(s.state.row);
  const second = await decideReport(ID, "remove", s.deps);
  assert.deepEqual(second, { ok: false, reason: "already_closed" });
  assert.equal(JSON.stringify(s.state.row), before, "the first decision stands");
  assert.deepEqual(s.seen.map((x) => x.init.method), ["PATCH", "PATCH", "GET"]);
  const get = new URL(s.seen[2].url);
  assert.equal(get.searchParams.get("id"), `eq.${ID}`);
});

test("decideReport: two concurrent decisions: exactly one closed, the other already_closed", async () => {
  const s = store();
  const [a, b] = await Promise.all([decideReport(ID, "remove", s.deps), decideReport(ID, "no_action", s.deps)]);
  const outcomes = [a, b].map((x) => (x.ok ? "closed" : x.reason)).sort();
  assert.deepEqual(outcomes, ["already_closed", "closed"]);
  const winner = a.ok ? "remove" : "no_action";
  assert.equal(s.state.row?.decision, winner);
});

test("decideReport: a legacy row that is not open (any other status) is already_closed", async () => {
  const s = store(row({ id: ID, status: "reviewed" }));
  assert.deepEqual(await decideReport(ID, "escalate", s.deps), { ok: false, reason: "already_closed" });
  assert.equal(s.state.row?.status, "reviewed");
});

test("decideReport: no such report is not_found (empty update, then an empty read)", async () => {
  const s = store(null);
  assert.deepEqual(await decideReport(ID, "no_action", s.deps), { ok: false, reason: "not_found" });
  assert.deepEqual(s.seen.map((x) => x.init.method), ["PATCH", "GET"]);
});

test("decideReport: an invalid decision is invalid, and a bad id is not_found, both before any request", async () => {
  const s = store();
  for (const d of ["", "delete", "NO_ACTION", " no_action", "no_action ", "remove\n", null, undefined, 5, {}, ["remove"], "open", "closed"]) {
    assert.deepEqual(await decideReport(ID, d, s.deps), { ok: false, reason: "invalid" }, String(d));
  }
  for (const id of ["", "a b", "a/b", "x".repeat(129), undefined, 5, null, "a,b", "a&id=eq.b", "a&status=neq.open", "x?select=*"]) {
    assert.deepEqual(await decideReport(id, "no_action", s.deps), { ok: false, reason: "not_found" }, String(id));
  }
  assert.deepEqual(await decideReport("a b", "nope", s.deps), { ok: false, reason: "invalid" }, "decision is checked first");
  assert.equal(s.seen.length, 0);
});

test("decideReport: not_configured makes no request", async () => {
  const s = store();
  assert.deepEqual(await decideReport(ID, "no_action", { ...s.deps, env: {} }), { ok: false, reason: "not_configured" });
  assert.deepEqual(await decideReport(ID, "no_action", { ...s.deps, env: { ...ENV, SUPABASE_URL: "http://example.com" } }), { ok: false, reason: "not_configured" });
  assert.equal(s.seen.length, 0);
});

test("decideReport: non-2xx (including a missing decision column), redirect, network error and non-JSON are unavailable and write nothing more", async () => {
  const bodies: Array<() => Response | Error> = [
    () => json({ code: "42703", message: "column report_flag.decision does not exist" }, 400),
    () => json([], 401),
    () => json([], 500),
    () => json([], 302),
    () => new Error("connect https://x.supabase.invalid svc-key-secret"),
    () => new Response("<html>", { status: 200 }),
    () => json({ id: ID }), // 200 but an object, not an array
  ];
  for (const b of bodies) {
    const f = fake(b);
    assert.deepEqual(await decideReport(ID, "no_action", f.deps), { ok: false, reason: "unavailable" });
    assert.equal(f.seen.length, 1, "no retry, no follow-up read after a failed write");
  }
});

test("decideReport: a response that does not say what was asked is unavailable", async () => {
  const closed = (over: Record<string, unknown> = {}) => row({ id: ID, status: "closed", decision: "remove", decided_at: NOW.toISOString(), ...over });
  const cases: unknown[] = [
    [closed(), closed()], // two rows for a primary key
    [closed({ id: "other-id" })], // a different row
    [closed({ status: "open" })], // not closed
    [closed({ decision: "no_action" })], // a different decision
    [closed({ decision: null })],
    [closed({ decided_at: null })],
    [closed({ decision: "bogus" })], // fails row validation
    [closed({ app_slug: null, application_id: null })], // fails row validation
    ["not a row"],
  ];
  for (const body of cases) {
    const f = fake(() => json(body));
    assert.deepEqual(await decideReport(ID, "remove", f.deps), { ok: false, reason: "unavailable" }, JSON.stringify(body).slice(0, 60));
  }
});

test("decideReport: an empty update followed by a failed read is unavailable; a read that still says open is unavailable, never a claim", async () => {
  const failedRead = fake((n) => (n === 1 ? json([]) : json([], 503)));
  assert.deepEqual(await decideReport(ID, "no_action", failedRead.deps), { ok: false, reason: "unavailable" });
  assert.equal(failedRead.seen.length, 2);
  const stillOpen = fake((n) => (n === 1 ? json([]) : json([{ ...row({ id: ID }), details: null }])));
  assert.deepEqual(await decideReport(ID, "no_action", stillOpen.deps), { ok: false, reason: "unavailable" });
});

test("decideReport: a hung request times out as unavailable", async () => {
  const hang = ((_u: string, init: RequestInit) =>
    new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as unknown as typeof fetch;
  const r = await decideReport(ID, "no_action", { env: ENV, fetch: hang, timeoutMs: 20 });
  assert.deepEqual(r, { ok: false, reason: "unavailable" });
});

test("decideReport: a body over the cap is unavailable", async () => {
  const declared = fake(() => new Response("[]", { status: 200, headers: { "content-length": String(REPORT_STORE_MAX_BODY_BYTES + 1) } }));
  assert.deepEqual(await decideReport(ID, "no_action", declared.deps), { ok: false, reason: "unavailable" });
  const streamed = fake(() => new Response(" ".repeat(REPORT_STORE_MAX_BODY_BYTES + 10) + "[]", { status: 200 }));
  assert.deepEqual(await decideReport(ID, "no_action", streamed.deps), { ok: false, reason: "unavailable" });
});

test("decideReport: an invalid clock is unavailable before any request; the default clock yields a parseable ISO time", async () => {
  const f = fake(() => json([]));
  assert.deepEqual(await decideReport(ID, "no_action", { ...f.deps, now: () => new Date(Number.NaN) }), { ok: false, reason: "unavailable" });
  assert.equal(f.seen.length, 0);
  const s = store();
  const { now: _now, ...noClock } = s.deps;
  assert.equal((await decideReport(ID, "no_action", noClock)).ok, true);
  const sent = JSON.parse(String(s.seen[0].init.body)).decided_at as string;
  assert.ok(Number.isFinite(Date.parse(sent)) && Math.abs(Date.now() - Date.parse(sent)) < 60_000);
});

test("decideReport: failures log a fixed label and status only: no id, decision, key, URL or body", async () => {
  const logged: string[] = [];
  const saved = [console.error, console.log, console.warn];
  console.error = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
  console.log = console.error;
  console.warn = console.error;
  try {
    for (const b of [() => json({ message: `bad ${ID} remove` }, 500), () => new Error(`connect https://x.supabase.invalid svc-key-secret ${ID}`), () => new Response("<html>", { status: 200 })]) {
      await decideReport(ID, "remove", fake(b).deps);
    }
    assert.ok(logged.length >= 3);
    for (const line of logged) {
      assert.match(line, /^report-store: decideReport failed, /);
      for (const secret of ["svc-key-secret", "supabase.invalid", ID, "remove"]) assert.ok(!line.includes(secret), line);
    }
  } finally {
    [console.error, console.log, console.warn] = saved;
    console.error = () => undefined;
  }
});
