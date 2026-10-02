import assert from "node:assert/strict";
import test from "node:test";
import { COUNT_EXCLUDE_MAX, buildCountQuery, readCatalogPublishedCount } from "../lib/catalog-count";
import { CATALOG_MAX_BODY_BYTES } from "../lib/catalog-table";

// Leaf 5.l.xiii.zi. Written, NOT run (standing operator instruction, 2026-10-02: no testing). Covers the
// TypeScript side against a fake fetch; nothing here talks to a real PostgREST.

const ENV = { SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "service-key-123" };

function fakeFetch(body: unknown, contentRange: string | null, seen: any[] = [], status = 200) {
  return (async (url: string, init: any) => {
    seen.push({ url, init });
    const headers: Record<string, string> = {};
    if (contentRange !== null) headers["content-range"] = contentRange;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
  }) as unknown as typeof fetch;
}

test("buildCountQuery with no exclusions counts published rows with one row asked for", () => {
  assert.equal(buildCountQuery({}), "select=slug&is_published=eq.true&limit=1");
  assert.equal(buildCountQuery({ excludePackages: [], excludeSlugs: [] }), "select=slug&is_published=eq.true&limit=1");
});

test("buildCountQuery quotes, escapes and encodes each excluded value", () => {
  const query = buildCountQuery({ excludePackages: ["com.a", 'we"ird,pkg\\x'], excludeSlugs: ["my-app"] })!;
  const params = new URLSearchParams(query);
  assert.equal(params.get("package_name"), 'not.in.("com.a","we\\"ird,pkg\\\\x")');
  assert.equal(params.get("slug"), 'not.in.("my-app")');
  assert.equal(params.get("is_published"), "eq.true");
  assert.equal(params.get("limit"), "1");
});

test("buildCountQuery de-duplicates and ignores empty values", () => {
  const params = new URLSearchParams(buildCountQuery({ excludePackages: ["com.a", "com.a", ""] })!);
  assert.equal(params.get("package_name"), 'not.in.("com.a")');
  assert.equal(params.get("slug"), null);
});

test("buildCountQuery refuses a list longer than the cap", () => {
  const many = Array.from({ length: COUNT_EXCLUDE_MAX + 1 }, (_, i) => `com.p${i}`);
  assert.equal(buildCountQuery({ excludePackages: many }), null);
  assert.equal(buildCountQuery({ excludeSlugs: many }), null);
  assert.notEqual(buildCountQuery({ excludePackages: many.slice(0, COUNT_EXCLUDE_MAX) }), null);
});

test("readCatalogPublishedCount asks for an exact count with the service key and returns the total", async () => {
  const seen: any[] = [];
  const out = await readCatalogPublishedCount({ excludePackages: ["com.a"] }, { env: ENV, fetch: fakeFetch([{ slug: "x" }], "0-0/1506", seen) });
  assert.deepEqual(out, { ok: true, total: 1506 });
  assert.equal(seen.length, 1);
  assert.ok(String(seen[0].url).startsWith("https://proj.supabase.co/rest/v1/catalog_app?"));
  assert.equal(seen[0].init.method, "GET");
  assert.equal(seen[0].init.headers.Prefer, "count=exact");
  assert.equal(seen[0].init.headers.apikey, "service-key-123");
  assert.equal(seen[0].init.redirect, "error");
});

test("an empty table counts 0 (the star form of Content-Range)", async () => {
  assert.deepEqual(await readCatalogPublishedCount({}, { env: ENV, fetch: fakeFetch([], "*/0") }), { ok: true, total: 0 });
});

test("a missing or garbled count, a non-2xx, a non-array body, bad JSON and an oversized body are unavailable", async () => {
  const cases: Array<[unknown, string | null, number]> = [
    [[], null, 200],
    [[], "garbage", 200],
    [[], "0-0/5", 500],
    [{ message: "x" }, "0-0/5", 200],
    ["{not json", "0-0/5", 200],
    ["x".repeat(CATALOG_MAX_BODY_BYTES + 1), "0-0/5", 200],
  ];
  for (const [body, range, status] of cases) {
    const out = await readCatalogPublishedCount({}, { env: ENV, fetch: fakeFetch(body, range, [], status) });
    assert.deepEqual(out, { ok: false, reason: "unavailable" });
  }
});

test("a thrown fetch is unavailable, an over-long list makes no request, and no config makes no request", async () => {
  const boom = (async () => {
    throw new Error("https://proj.supabase.co/secret-looking-url");
  }) as unknown as typeof fetch;
  assert.deepEqual(await readCatalogPublishedCount({}, { env: ENV, fetch: boom }), { ok: false, reason: "unavailable" });

  const seen: any[] = [];
  const many = Array.from({ length: COUNT_EXCLUDE_MAX + 1 }, (_, i) => `com.p${i}`);
  assert.deepEqual(await readCatalogPublishedCount({ excludePackages: many }, { env: ENV, fetch: fakeFetch([], "*/0", seen) }), { ok: false, reason: "unavailable" });
  assert.deepEqual(await readCatalogPublishedCount({}, { env: {}, fetch: fakeFetch([], "*/0", seen) }), { ok: false, reason: "not_configured" });
  assert.equal(seen.length, 0);
});
