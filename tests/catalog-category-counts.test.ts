import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORY_COUNTS_MAX_ROWS, buildCategoryCountsBody, readCatalogCategoryCounts } from "../lib/catalog-category-counts";
import { COUNT_EXCLUDE_MAX } from "../lib/catalog-count";
import { CATALOG_MAX_BODY_BYTES } from "../lib/catalog-table";

// Leaf 5.l.xiii.zo. Written, NOT run (standing operator instruction, 2026-10-02: no testing). Covers the
// TypeScript side against a fake fetch; the SQL function is not exercised (no Postgres here).

const ENV = { SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "service-key-123" };

function fakeFetch(body: unknown, seen: any[] = [], status = 200) {
  return (async (url: string, init: any) => {
    seen.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

test("buildCategoryCountsBody de-duplicates and drops blanks", () => {
  assert.deepEqual(buildCategoryCountsBody({ excludePackages: ["com.a", "com.a", ""], excludeSlugs: ["x"] }), {
    p_exclude_packages: ["com.a"],
    p_exclude_slugs: ["x"],
  });
  assert.deepEqual(buildCategoryCountsBody({}), { p_exclude_packages: [], p_exclude_slugs: [] });
});

test("buildCategoryCountsBody refuses a list over the cap", () => {
  const many = Array.from({ length: COUNT_EXCLUDE_MAX + 1 }, (_, i) => `com.p${i}`);
  assert.equal(buildCategoryCountsBody({ excludePackages: many }), null);
  assert.equal(buildCategoryCountsBody({ excludeSlugs: many }), null);
  assert.notEqual(buildCategoryCountsBody({ excludePackages: many.slice(0, COUNT_EXCLUDE_MAX) }), null);
});

test("posts the exclusions to the rpc with the service key and returns the groups", async () => {
  const seen: any[] = [];
  const out = await readCatalogCategoryCounts(
    { excludePackages: ["com.a"], excludeSlugs: ["my-app"] },
    { env: ENV, fetch: fakeFetch([{ app_type: "app", category: "tools", total: 12 }, { app_type: "game", category: "puzzle", total: 3 }], seen) }
  );
  assert.deepEqual(out, {
    ok: true,
    counts: [
      { appType: "app", category: "tools", total: 12 },
      { appType: "game", category: "puzzle", total: 3 },
    ],
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://proj.supabase.co/rest/v1/rpc/catalog_category_counts");
  assert.equal(seen[0].init.method, "POST");
  assert.equal(seen[0].init.headers.apikey, "service-key-123");
  assert.equal(seen[0].init.redirect, "error");
  assert.deepEqual(JSON.parse(seen[0].init.body), { p_exclude_packages: ["com.a"], p_exclude_slugs: ["my-app"] });
});

test("an empty table is an empty list, not a failure", async () => {
  assert.deepEqual(await readCatalogCategoryCounts({}, { env: ENV, fetch: fakeFetch([]) }), { ok: true, counts: [] });
});

test("not configured makes no request", async () => {
  const seen: any[] = [];
  const out = await readCatalogCategoryCounts({}, { env: {}, fetch: fakeFetch([], seen) });
  assert.deepEqual(out, { ok: false, reason: "not_configured" });
  assert.equal(seen.length, 0);
});

test("a list over the cap is unavailable and makes no request", async () => {
  const seen: any[] = [];
  const many = Array.from({ length: COUNT_EXCLUDE_MAX + 1 }, (_, i) => `com.p${i}`);
  const out = await readCatalogCategoryCounts({ excludePackages: many }, { env: ENV, fetch: fakeFetch([], seen) });
  assert.deepEqual(out, { ok: false, reason: "unavailable" });
  assert.equal(seen.length, 0);
});

test("a non-2xx answer (for example the function is not there yet) is unavailable", async () => {
  assert.deepEqual(await readCatalogCategoryCounts({}, { env: ENV, fetch: fakeFetch({ message: "not found" }, [], 404) }), { ok: false, reason: "unavailable" });
});

test("one malformed row refuses the whole answer", async () => {
  const good = { app_type: "app", category: "tools", total: 1 };
  for (const bad of [
    { app_type: "tv", category: "tools", total: 1 },
    { app_type: "app", category: "Bad Slug", total: 1 },
    { app_type: "app", category: "x", total: "5" },
    { app_type: "app", category: "x", total: -1 },
    { app_type: "app", category: "x", total: 1.5 },
    null,
    "text",
  ]) {
    assert.deepEqual(await readCatalogCategoryCounts({}, { env: ENV, fetch: fakeFetch([good, bad]) }), { ok: false, reason: "unavailable" });
  }
});

test("a repeated pair, a non-array and too many rows are unavailable", async () => {
  const row = { app_type: "app", category: "tools", total: 1 };
  assert.deepEqual(await readCatalogCategoryCounts({}, { env: ENV, fetch: fakeFetch([row, row]) }), { ok: false, reason: "unavailable" });
  assert.deepEqual(await readCatalogCategoryCounts({}, { env: ENV, fetch: fakeFetch({ rows: [] }) }), { ok: false, reason: "unavailable" });
  const tooMany = Array.from({ length: CATEGORY_COUNTS_MAX_ROWS + 1 }, (_, i) => ({ app_type: "app", category: `c${i}`, total: 1 }));
  assert.deepEqual(await readCatalogCategoryCounts({}, { env: ENV, fetch: fakeFetch(tooMany) }), { ok: false, reason: "unavailable" });
});

test("an oversized or unparsable answer and a thrown fetch are unavailable", async () => {
  assert.deepEqual(await readCatalogCategoryCounts({}, { env: ENV, fetch: fakeFetch("x".repeat(CATALOG_MAX_BODY_BYTES + 1)) }), { ok: false, reason: "unavailable" });
  assert.deepEqual(await readCatalogCategoryCounts({}, { env: ENV, fetch: fakeFetch("not json") }), { ok: false, reason: "unavailable" });
  const throwing = (async () => {
    throw new Error("boom https://secret.example");
  }) as unknown as typeof fetch;
  assert.deepEqual(await readCatalogCategoryCounts({}, { env: ENV, fetch: throwing }), { ok: false, reason: "unavailable" });
});
