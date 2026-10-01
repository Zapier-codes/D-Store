import assert from "node:assert/strict";
import test from "node:test";
import { handleStats } from "../lib/stats-handler";
import type { StatsStoreResult } from "../lib/stats-store";

// Leaf 5.g.v.zo. Written without being run, at the operator's request.

const STATS: any = { generated_at: "2026-10-01T10:00:00Z", traffic: { total_installs: 1, total_views: 2, apps_tracked: 1, per_app: [] },
  searches: { total: 0, distinct_queries: 0, top: [] }, reports: { total: 0, by_status: {}, by_reason: {} },
  reviews: { total: 0, average_rating: null, per_app: [] } };
const req = () => new Request("https://dstore.example/api/stats", { headers: { authorization: "Bearer whatever" } });

function run(auth: { ok: true } | { ok: false; status: 401 | 503 }, store: StatsStoreResult) {
  const calls = { auth: 0, store: 0 };
  const res = handleStats(req(), {
    checkAuth: async () => { calls.auth += 1; return auth; },
    readStats: async () => { calls.store += 1; return store; },
  });
  return { res, calls };
}

test("a good token and a readable store: 200 with the document and no-store", async () => {
  const { res, calls } = run({ ok: true }, { ok: true, stats: STATS });
  const r = await res;
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(await r.json(), STATS);
  assert.deepEqual(calls, { auth: 1, store: 1 });
});

test("the token is checked first: 401 and 503 never reach the store", async () => {
  for (const [auth, status] of [[{ ok: false, status: 401 }, 401], [{ ok: false, status: 503 }, 503]] as const) {
    const { res, calls } = run(auth as any, { ok: true, stats: STATS });
    const r = await res;
    assert.equal(r.status, status);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(calls.store, 0);
    assert.ok(!JSON.stringify(await r.json()).includes("traffic"));
  }
});

test("store not configured is 503 and unavailable is 502, with fixed bodies", async () => {
  const a = await run({ ok: true }, { ok: false, reason: "not_configured" }).res;
  assert.equal(a.status, 503);
  const b = await run({ ok: true }, { ok: false, reason: "unavailable" }).res;
  assert.equal(b.status, 502);
  for (const r of [a, b]) {
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.deepEqual(Object.keys(await r.json()), ["error"]);
  }
});

test("the route exports GET only", async () => {
  const mod = await import("../app/api/stats/route");
  assert.equal(typeof mod.GET, "function");
  for (const m of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal((mod as any)[m], undefined, m);
});
