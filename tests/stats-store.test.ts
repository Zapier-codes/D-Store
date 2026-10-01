import assert from "node:assert/strict";
import test from "node:test";
import { isStatsStoreConfigured, parseStatsDocument, readStoreStats, STATS_STORE_MAX_BODY_BYTES } from "../lib/stats-store";

// Leaf 5.g.v.zo. Written without being run, at the operator's request.

const doc = () => ({
  generated_at: "2026-10-01T10:00:00Z",
  traffic: {
    total_installs: 12,
    total_views: 90,
    apps_tracked: 2,
    per_app: [{ slug: "whatsapp", install_count: 10, view_count: 80 }],
  },
  searches: { total: 5, distinct_queries: 2, top: [{ query: "chat", count: 4 }] },
  reports: { total: 3, by_status: { open: 2, closed: 1 }, by_reason: { Other: 3 } },
  reviews: { total: 0, average_rating: null, per_app: [] },
});
const ENV = { SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "service-key" };

function fakeFetch(res: { status?: number; body?: string } | Error, seen: any[] = []) {
  return (async (url: string, init: any) => {
    seen.push({ url, init });
    if (res instanceof Error) throw res;
    return new Response(res.body ?? JSON.stringify(doc()), { status: res.status ?? 200 });
  }) as unknown as typeof fetch;
}

test("not configured: no request is made", async () => {
  let called = false;
  const f = (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch;
  for (const env of [{}, { SUPABASE_URL: ENV.SUPABASE_URL }, { ...ENV, SUPABASE_URL: "http://proj.supabase.co" }, { ...ENV, SUPABASE_URL: "nope" }]) {
    assert.deepEqual(await readStoreStats({ env, fetch: f }), { ok: false, reason: "not_configured" });
    assert.equal(isStatsStoreConfigured(env), false);
  }
  assert.equal(called, false);
  assert.equal(isStatsStoreConfigured(ENV), true);
  assert.equal(isStatsStoreConfigured({ ...ENV, SUPABASE_URL: "http://localhost:54321" }), true);
});

test("one POST to the store_stats RPC with the service key, redirect error and a timeout", async () => {
  const seen: any[] = [];
  const r = await readStoreStats({ env: ENV, fetch: fakeFetch({}, seen) });
  assert.equal(r.ok, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://proj.supabase.co/rest/v1/rpc/store_stats");
  assert.equal(seen[0].init.method, "POST");
  assert.equal(seen[0].init.redirect, "error");
  assert.equal(seen[0].init.headers.apikey, "service-key");
  assert.equal(seen[0].init.headers.Authorization, "Bearer service-key");
  assert.ok(seen[0].init.signal);
});

test("a non-2xx, a network error, non-JSON and an oversized body are unavailable", async () => {
  for (const res of [{ status: 500 }, { status: 404 }, { body: "not json" }, { body: "x".repeat(STATS_STORE_MAX_BODY_BYTES + 1) }, new Error("down")]) {
    assert.deepEqual(await readStoreStats({ env: ENV, fetch: fakeFetch(res as any) }), { ok: false, reason: "unavailable" });
  }
});

test("the failure log carries a fixed label and a status, never the key or a body", async () => {
  const logged: unknown[][] = [];
  const real = console.error;
  console.error = (...a: unknown[]) => void logged.push(a);
  try {
    await readStoreStats({ env: ENV, fetch: fakeFetch({ status: 500, body: "secret body service-key" }) });
  } finally {
    console.error = real;
  }
  assert.ok(logged.length > 0);
  assert.ok(!JSON.stringify(logged).includes("service-key"));
  assert.ok(!JSON.stringify(logged).includes("secret body"));
});

test("the document is rebuilt: only contract keys survive, extras never reach the caller", () => {
  const noisy: any = doc();
  noisy.reviews.comment = "secret text";
  noisy.reports.details = "secret details";
  noisy.traffic.per_app[0].ip_hash = "abc";
  noisy.extra = 1;
  const parsed = parseStatsDocument(noisy)!;
  assert.ok(parsed);
  assert.ok(!JSON.stringify(parsed).includes("secret"));
  assert.ok(!JSON.stringify(parsed).includes("ip_hash"));
  assert.deepEqual(Object.keys(parsed), ["generated_at", "traffic", "searches", "reports", "reviews"]);
  assert.deepEqual(parsed, doc());
});

test("each wrong type is rejected", () => {
  const cases: Array<(d: any) => void> = [
    (d) => (d.generated_at = 5),
    (d) => (d.traffic.total_views = -1),
    (d) => (d.traffic.total_views = "90"),
    (d) => (d.traffic.total_views = 1.5),
    (d) => (d.traffic.per_app = {}),
    (d) => (d.traffic.per_app[0].slug = null),
    (d) => (d.searches.top = [1]),
    (d) => (d.reports.by_status = { open: "x" }),
    (d) => (d.reports.by_reason = []),
    (d) => (d.reviews.average_rating = 6),
    (d) => (d.reviews.average_rating = "high"),
    (d) => delete d.reviews,
  ];
  cases.forEach((mutate, i) => {
    const d = doc();
    mutate(d);
    assert.equal(parseStatsDocument(d), null, `case ${i}`);
  });
  assert.equal(parseStatsDocument(null), null);
  assert.equal(parseStatsDocument([]), null);
});

test("a null average with no reviews and a decimal average with some are both accepted", () => {
  const d: any = doc();
  d.reviews = { total: 2, average_rating: 4.5, per_app: [{ slug: "whatsapp", count: 2, average_rating: 4.5 }] };
  assert.equal(parseStatsDocument(d)!.reviews.average_rating, 4.5);
  assert.equal(parseStatsDocument(doc())!.reviews.average_rating, null);
});

test("a tally key of __proto__ does not pollute anything", () => {
  const d: any = JSON.parse(JSON.stringify(doc()));
  d.reports.by_status = JSON.parse('{"__proto__": 1, "open": 2}');
  parseStatsDocument(d);
  assert.equal(({} as any).polluted, undefined);
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
});
