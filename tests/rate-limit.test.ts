import assert from "node:assert/strict";
import test from "node:test";
import {
  checkRateLimit,
  clientAddress,
  isRateLimitConfigured,
  rateLimitKey,
  tooManyRequests,
} from "../lib/rate-limit";

const ENV = { SUPABASE_URL: "https://x.supabase.invalid", SUPABASE_SERVICE_ROLE_KEY: "svc-key" };
const h = (init: Record<string, string> = {}) => new Headers(init);

test("clientAddress: first x-forwarded-for entry, then x-real-ip, else unknown; capped", () => {
  assert.equal(clientAddress(h({ "x-forwarded-for": "1.2.3.4, 9.9.9.9" })), "1.2.3.4");
  assert.equal(clientAddress(h({ "x-real-ip": "5.6.7.8" })), "5.6.7.8");
  assert.equal(clientAddress(h()), "unknown");
  assert.equal(clientAddress(h({ "x-forwarded-for": "a".repeat(500) })).length, 64);
});

test("rateLimitKey: scoped, hashed, stable, salted, and never contains the address", () => {
  const headers = h({ "x-forwarded-for": "203.0.113.7" });
  const k = rateLimitKey("report", headers, {});
  assert.match(k, /^report:[0-9a-f]{32}$/);
  assert.ok(!k.includes("203.0.113.7"));
  assert.equal(k, rateLimitKey("report", headers, {}));
  assert.notEqual(k, rateLimitKey("report", headers, { RATE_LIMIT_SALT: "pepper" }));
  assert.notEqual(k, rateLimitKey("report", h({ "x-forwarded-for": "203.0.113.8" }), {}));
  // Same client, different scope: same hash, different bucket.
  assert.notEqual(k, rateLimitKey("view", headers, {}));
  assert.equal(k.split(":")[1], rateLimitKey("view", headers, {}).split(":")[1]);
});

test("isRateLimitConfigured needs both variables", () => {
  assert.equal(isRateLimitConfigured(ENV), true);
  assert.equal(isRateLimitConfigured({ SUPABASE_URL: "https://x" }), false);
  assert.equal(isRateLimitConfigured({}), false);
});

test("unconfigured: fail-open allows, fail-closed refuses", async () => {
  assert.equal(await checkRateLimit("k", 1, 60, { env: {} }), true);
  assert.equal(await checkRateLimit("k", 1, 60, { env: {}, failOpen: false }), false);
});

test("calls the RPC with the service key and reads the boolean", async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response("false", { status: 200 });
  }) as unknown as typeof fetch;
  assert.equal(await checkRateLimit("view:abc", 3, 600, { env: ENV, fetchImpl }), false);
  assert.equal(seen?.url, "https://x.supabase.invalid/rest/v1/rpc/check_rate_limit");
  assert.deepEqual(JSON.parse(String(seen?.init.body)), { p_key: "view:abc", p_max: 3, p_window_seconds: 600 });
  const headers = seen?.init.headers as Record<string, string>;
  assert.equal(headers.apikey, "svc-key");
  assert.equal(headers.Authorization, "Bearer svc-key");

  const allow = (async () => new Response("true", { status: 200 })) as unknown as typeof fetch;
  assert.equal(await checkRateLimit("k", 3, 60, { env: ENV, fetchImpl: allow }), true);
});

test("an unexpected payload is never read as allowed unless it is exactly true", async () => {
  for (const body of ["null", '"true"', "1", "{}", "[]"]) {
    const fetchImpl = (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
    assert.equal(await checkRateLimit("k", 1, 60, { env: ENV, fetchImpl, failOpen: true }), false, body);
  }
});

test("HTTP error, network error and bad JSON follow the failure policy and never throw", async () => {
  const cases: Array<typeof fetch> = [
    (async () => new Response("no", { status: 500 })) as unknown as typeof fetch,
    (async () => {
      throw new Error("boom https://x.supabase.invalid secret");
    }) as unknown as typeof fetch,
    (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch,
  ];
  for (const fetchImpl of cases) {
    assert.equal(await checkRateLimit("k", 1, 60, { env: ENV, fetchImpl }), true);
    assert.equal(await checkRateLimit("k", 1, 60, { env: ENV, fetchImpl, failOpen: false }), false);
  }
});

test("tooManyRequests is a 429 with Retry-After and no caching", async () => {
  const res = tooManyRequests();
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "60");
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await res.json(), { error: "Too many requests" });
});
