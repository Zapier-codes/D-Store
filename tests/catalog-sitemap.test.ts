import assert from "node:assert/strict";
import test from "node:test";
import { readCatalogSitemapChunk, readCatalogSitemapTotal } from "../lib/catalog-sitemap";
import { CATALOG_MAX_BODY_BYTES } from "../lib/catalog-table";

// Leaf 5.l.vi.zo. Written, NOT run (standing operator instruction, 2026-10-02: no testing). These cover
// the TypeScript side against a fake fetch; nothing here talks to a real PostgREST.

const ENV = { SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "service-key-123" };

function row(i: number, over: Record<string, unknown> = {}) {
  return { slug: `app-${i}`, package_name: `com.example.app${i}`, source_updated_at: "2026-09-10T12:00:00+00:00", ...over };
}

function fakeFetch(body: unknown, contentRange: string | null, seen: any[] = [], status = 200) {
  return (async (url: string, init: any) => {
    seen.push({ url, init });
    const headers: Record<string, string> = {};
    if (contentRange !== null) headers["content-range"] = contentRange;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
  }) as unknown as typeof fetch;
}

test("readCatalogSitemapTotal asks for one published row with an exact count and returns the total", async () => {
  const seen: any[] = [];
  const out = await readCatalogSitemapTotal({ env: ENV, fetch: fakeFetch([{ slug: "a" }], "0-0/10000", seen) });
  assert.deepEqual(out, { ok: true, total: 10000 });
  assert.equal(seen.length, 1);
  const url = String(seen[0].url);
  assert.ok(url.startsWith("https://proj.supabase.co/rest/v1/catalog_app?"));
  assert.ok(url.includes("is_published=eq.true"));
  assert.ok(url.includes("limit=1"));
  assert.equal(seen[0].init.method, "GET");
  assert.equal(seen[0].init.headers.Prefer, "count=exact");
  assert.equal(seen[0].init.headers.apikey, "service-key-123");
  assert.equal(seen[0].init.redirect, "error");
});

test("an empty table has a total of 0 (the star form of Content-Range)", async () => {
  const out = await readCatalogSitemapTotal({ env: ENV, fetch: fakeFetch([], "*/0") });
  assert.deepEqual(out, { ok: true, total: 0 });
});

test("readCatalogSitemapChunk asks for the right slice, ordered by slug, three columns only", async () => {
  const seen: any[] = [];
  const rows = Array.from({ length: 1000 }, (_, i) => row(i));
  const out = await readCatalogSitemapChunk(2, { env: ENV, fetch: fakeFetch(rows, "2000-2999/10000", seen) });
  assert.equal(out.ok, true);
  const url = String(seen[0].url);
  assert.ok(url.includes("select=slug,package_name,source_updated_at"));
  assert.ok(url.includes("order=slug.asc"));
  assert.ok(url.includes("limit=1000"));
  assert.ok(url.includes("offset=2000"));
  assert.ok(url.includes("is_published=eq.true"));
  assert.ok(!url.includes("raw"));
  if (out.ok) {
    assert.equal(out.rows.length, 1000);
    assert.equal(out.total, 10000);
    assert.deepEqual(out.rows[0], { slug: "app-0", package_name: "com.example.app0", updated_at: "2026-09-10T12:00:00+00:00" });
  }
});

test("the last chunk is the remainder, and a chunk past the end is empty and ok", async () => {
  const last = await readCatalogSitemapChunk(1, { env: ENV, fetch: fakeFetch([row(1), row(2), row(3)], "1000-1002/1003") });
  assert.equal(last.ok && last.rows.length, 3);
  const past = await readCatalogSitemapChunk(5, { env: ENV, fetch: fakeFetch([], "*/1003") });
  assert.deepEqual(past, { ok: true, rows: [], total: 1003 });
});

test("a chunk shorter than the table's count is refused whole (max-rows below 1,000, a dropped tail)", async () => {
  const rows = Array.from({ length: 500 }, (_, i) => row(i));
  const out = await readCatalogSitemapChunk(0, { env: ENV, fetch: fakeFetch(rows, "0-499/10000") });
  assert.deepEqual(out, { ok: false, reason: "unavailable" });
});

test("more rows than asked for is refused", async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => row(i));
  const out = await readCatalogSitemapChunk(0, { env: ENV, fetch: fakeFetch(rows, "0-1000/5000") });
  assert.deepEqual(out, { ok: false, reason: "unavailable" });
});

test("a malformed row refuses the whole chunk", async () => {
  for (const bad of [
    row(1, { slug: "has space" }),
    row(1, { slug: "../x" }),
    row(1, { slug: 5 }),
    row(1, { package_name: "" }),
    row(1, { source_updated_at: "yesterday" }),
    row(1, { source_updated_at: null }),
    null,
    "text",
  ]) {
    const out = await readCatalogSitemapChunk(0, { env: ENV, fetch: fakeFetch([row(0), bad], "0-1/2") });
    assert.deepEqual(out, { ok: false, reason: "unavailable" }, JSON.stringify(bad));
  }
});

test("no Content-Range, a non-2xx status, a non-array body, bad JSON and an oversized body are all unavailable", async () => {
  const cases: Array<[unknown, string | null, number]> = [
    [[row(0)], null, 200],
    [[row(0)], "0-0/1", 500],
    [{ message: "x" }, "0-0/1", 200],
    ["{not json", "0-0/1", 200],
    ["x".repeat(CATALOG_MAX_BODY_BYTES + 1), "0-0/1", 200],
    [[row(0)], "garbage", 200],
  ];
  for (const [body, range, status] of cases) {
    const out = await readCatalogSitemapChunk(0, { env: ENV, fetch: fakeFetch(body, range, [], status) });
    assert.deepEqual(out, { ok: false, reason: "unavailable" });
  }
});

test("a thrown fetch is unavailable and never throws out", async () => {
  const boom = (async () => {
    throw new Error("https://proj.supabase.co/secret-looking-url");
  }) as unknown as typeof fetch;
  const out = await readCatalogSitemapChunk(0, { env: ENV, fetch: boom });
  assert.deepEqual(out, { ok: false, reason: "unavailable" });
  const total = await readCatalogSitemapTotal({ env: ENV, fetch: boom });
  assert.deepEqual(total, { ok: false, reason: "unavailable" });
});

test("not configured makes no request", async () => {
  const seen: any[] = [];
  const noEnv = await readCatalogSitemapChunk(0, { env: {}, fetch: fakeFetch([], "*/0", seen) });
  assert.deepEqual(noEnv, { ok: false, reason: "not_configured" });
  const noKey = await readCatalogSitemapTotal({ env: { SUPABASE_URL: "https://proj.supabase.co" }, fetch: fakeFetch([], "*/0", seen) });
  assert.deepEqual(noKey, { ok: false, reason: "not_configured" });
  assert.equal(seen.length, 0);
});

test("a bad chunk index makes no request", async () => {
  const seen: any[] = [];
  for (const bad of [-1, 1.5, 10000, Number.NaN]) {
    const out = await readCatalogSitemapChunk(bad, { env: ENV, fetch: fakeFetch([], "*/0", seen) });
    assert.deepEqual(out, { ok: false, reason: "unavailable" });
  }
  assert.equal(seen.length, 0);
});
