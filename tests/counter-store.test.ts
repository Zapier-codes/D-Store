import assert from "node:assert/strict";
import test from "node:test";
import { incrementCounter, isCounterStoreConfigured, logSearch, normalizeSearchQuery } from "../lib/counter-store";

// Leaf 5.g.v.zo part (d). Written without being run, at the operator's request.

const ENV = { SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "service-key" };

function fakeFetch(res: { status?: number; body?: string } | Error, seen: any[] = []) {
  return (async (url: string, init: any) => {
    seen.push({ url, init });
    if (res instanceof Error) throw res;
    return new Response(res.body ?? "7", { status: res.status ?? 200 });
  }) as unknown as typeof fetch;
}

test("not configured: no request is made, for the counters and the log", async () => {
  let called = false;
  const f = (async () => ((called = true), new Response("1"))) as unknown as typeof fetch;
  assert.deepEqual(await incrementCounter("install", "whatsapp", { env: {}, fetch: f }), { ok: false, reason: "not_configured" });
  assert.deepEqual(await logSearch("chat", { env: {}, fetch: f }), { ok: false, reason: "not_configured" });
  assert.equal(called, false);
  assert.equal(isCounterStoreConfigured({}), false);
  assert.equal(isCounterStoreConfigured(ENV), true);
});

test("a plain http or credentialed URL is not configured", async () => {
  for (const url of ["http://proj.supabase.co", "https://u:p@proj.supabase.co", "nonsense"]) {
    assert.equal(isCounterStoreConfigured({ ...ENV, SUPABASE_URL: url }), false);
  }
  assert.equal(isCounterStoreConfigured({ ...ENV, SUPABASE_URL: "http://127.0.0.1:54321" }), true);
});

test("install and view call their own function with p_slug and return the number", async () => {
  const seen: any[] = [];
  const a = await incrementCounter("install", "whatsapp", { env: ENV, fetch: fakeFetch({ body: "12" }, seen) });
  const b = await incrementCounter("view", "whatsapp", { env: ENV, fetch: fakeFetch({ body: "90" }, seen) });
  assert.deepEqual(a, { ok: true, count: 12 });
  assert.deepEqual(b, { ok: true, count: 90 });
  assert.equal(seen[0].url, "https://proj.supabase.co/rest/v1/rpc/increment_app_install");
  assert.equal(seen[1].url, "https://proj.supabase.co/rest/v1/rpc/increment_app_view");
  assert.equal(seen[0].init.body, JSON.stringify({ p_slug: "whatsapp" }));
  assert.equal(seen[0].init.redirect, "error");
  assert.equal(seen[0].init.headers.Authorization, "Bearer service-key");
});

test("a non-2xx, a network error, and a body that is not a count are all unavailable", async () => {
  const bad = { ok: false, reason: "unavailable" };
  assert.deepEqual(await incrementCounter("view", "x", { env: ENV, fetch: fakeFetch({ status: 500 }) }), bad);
  assert.deepEqual(await incrementCounter("view", "x", { env: ENV, fetch: fakeFetch(new Error("boom")) }), bad);
  for (const body of ['"7"', "-1", "1.5", "null", "{}", "not json", "1".repeat(5000)]) {
    assert.deepEqual(await incrementCounter("view", "x", { env: ENV, fetch: fakeFetch({ body }) }), bad, body.slice(0, 12));
  }
});

test("normalizeSearchQuery trims, lower-cases, truncates to 200, and is null when empty", () => {
  assert.equal(normalizeSearchQuery("  Chat App "), "chat app");
  assert.equal(normalizeSearchQuery("   "), null);
  assert.equal(normalizeSearchQuery("a".repeat(300))?.length, 200);
  assert.equal(normalizeSearchQuery(" ".repeat(5) + "B" + " ".repeat(300)), "b");
});

test("logSearch posts only the normalized text, and an empty query makes no request", async () => {
  const seen: any[] = [];
  assert.deepEqual(await logSearch("  Chat ", { env: ENV, fetch: fakeFetch({ status: 201, body: "" }, seen) }), { ok: true });
  assert.equal(seen[0].url, "https://proj.supabase.co/rest/v1/search_log");
  assert.equal(seen[0].init.body, JSON.stringify({ query_norm: "chat" }));
  const none: any[] = [];
  assert.deepEqual(await logSearch("   ", { env: ENV, fetch: fakeFetch({}, none) }), { ok: true });
  assert.equal(none.length, 0);
});

test("logSearch failures never throw", async () => {
  const bad = { ok: false, reason: "unavailable" };
  assert.deepEqual(await logSearch("chat", { env: ENV, fetch: fakeFetch({ status: 400 }) }), bad);
  assert.deepEqual(await logSearch("chat", { env: ENV, fetch: fakeFetch(new Error("boom")) }), bad);
});
