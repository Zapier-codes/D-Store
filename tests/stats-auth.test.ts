import assert from "node:assert/strict";
import test from "node:test";
import { checkStatsAuth, STATS_READ_TOKEN_MIN_LENGTH } from "../lib/stats-auth";

// Leaf 5.g.v.zo. Written without being run, at the operator's request.

const TOKEN = "s".repeat(40);
const env = (over: Record<string, string | undefined> = {}) => ({ STATS_READ_TOKEN: TOKEN, ...over });
const headers = (value?: string) => new Headers(value === undefined ? {} : { authorization: value });

test("a correct bearer token passes, and the scheme name is case-insensitive", async () => {
  assert.deepEqual(await checkStatsAuth(headers(`Bearer ${TOKEN}`), env()), { ok: true });
  assert.deepEqual(await checkStatsAuth(headers(`bearer ${TOKEN}`), env()), { ok: true });
});

test("unset, short or whitespace-bearing secret is 503, even with the right header", async () => {
  for (const STATS_READ_TOKEN of [undefined, "", "x".repeat(STATS_READ_TOKEN_MIN_LENGTH - 1), `${TOKEN}\n`, `${TOKEN} x`]) {
    const h = headers(`Bearer ${STATS_READ_TOKEN ?? ""}`);
    assert.deepEqual(await checkStatsAuth(h, { STATS_READ_TOKEN }), { ok: false, status: 503 });
  }
});

test("missing, malformed and wrong headers are all 401", async () => {
  for (const value of [undefined, "", TOKEN, `Basic ${TOKEN}`, `Bearer`, `Bearer  ${TOKEN}`, `Bearer ${TOKEN} extra`, `Bearer ${"t".repeat(40)}`, `Bearer ${TOKEN}x`]) {
    assert.deepEqual(await checkStatsAuth(headers(value), env()), { ok: false, status: 401 }, String(value));
  }
});

test("the push dispatch secret and the admin password do not open it", async () => {
  const other = "p".repeat(40);
  const e = env({ PUSH_DISPATCH_SECRET: other, ADMIN_PASSWORD: other });
  assert.deepEqual(await checkStatsAuth(headers(`Bearer ${other}`), e), { ok: false, status: 401 });
});

test("a result never carries the token", async () => {
  for (const h of [headers(`Bearer ${TOKEN}`), headers(`Bearer nope`)]) {
    assert.ok(!JSON.stringify(await checkStatsAuth(h, env())).includes(TOKEN));
  }
});

test("a failing Web Crypto fails closed as 503", async () => {
  const real = crypto.subtle.digest;
  (crypto.subtle as any).digest = () => Promise.reject(new Error("boom"));
  try {
    assert.deepEqual(await checkStatsAuth(headers(`Bearer ${TOKEN}`), env()), { ok: false, status: 503 });
  } finally {
    (crypto.subtle as any).digest = real;
  }
});
