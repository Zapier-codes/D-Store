import assert from "node:assert/strict";
import test from "node:test";
import {
  REPORT_PAGE_DEFAULT,
  REPORT_PAGE_MAX,
  REPORT_STORE_MAX_BODY_BYTES,
  decodeReportCursor,
  encodeReportCursor,
  isReportStoreConfigured,
  readReport,
  readReports,
  type ReportStoreDeps,
} from "../lib/report-store";

// Leaf 3.c.vii.zo. Written without being run, at the operator's request.

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
