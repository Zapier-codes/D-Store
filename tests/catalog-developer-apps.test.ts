import assert from "node:assert/strict";
import test from "node:test";
import { COUNT_EXCLUDE_MAX } from "../lib/catalog-count";
import { DEVELOPER_APPS_LIMIT, buildDeveloperAppsQuery, readCatalogDeveloperApps } from "../lib/catalog-developer-apps";
import { CATALOG_MAX_BODY_BYTES } from "../lib/catalog-table";

// Leaf 5.l.xiv.zi. Written, NOT run (standing operator instruction, 2026-10-02: no testing). Covers the
// TypeScript side against a fake fetch; nothing here talks to a real PostgREST.

const ENV = { SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "service-key-123" };

function row(slug: string, developer = "acme") {
  return {
    id: `aptoide-${slug}`, slug, package_name: `com.${slug}`, origin: "aptoide", name: slug, summary: "s", icon: "i", version: "1",
    app_type: "app", category: "tools", developer_slug: developer, developer_name: "Acme", license: "MIT", size_mb: 1.5,
    download_url: "", reported_downloads: 10, source_created_at: "2026-01-01T00:00:00Z", source_updated_at: "2026-02-01T00:00:00Z",
  };
}

function fakeFetch(body: unknown, contentRange: string | null, seen: any[] = [], status = 200) {
  return (async (url: string, init: any) => {
    seen.push({ url, init });
    const headers: Record<string, string> = {};
    if (contentRange !== null) headers["content-range"] = contentRange;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
  }) as unknown as typeof fetch;
}

test("buildDeveloperAppsQuery filters by developer, newest first, with a limit", () => {
  const params = new URLSearchParams(buildDeveloperAppsQuery({ developerSlug: "acme" })!);
  assert.equal(params.get("developer_slug"), "eq.acme");
  assert.equal(params.get("is_published"), "eq.true");
  assert.equal(params.get("order"), "source_updated_at.desc,slug.asc");
  assert.equal(params.get("limit"), String(DEVELOPER_APPS_LIMIT));
  assert.equal(params.get("package_name"), null);
});

test("buildDeveloperAppsQuery encodes the slug and quotes the exclusions", () => {
  const params = new URLSearchParams(buildDeveloperAppsQuery({ developerSlug: "a&b=c", excludePackages: ["com.a"], excludeSlugs: ['we"ird'] })!);
  assert.equal(params.get("developer_slug"), "eq.a&b=c");
  assert.equal(params.get("package_name"), 'not.in.("com.a")');
  assert.equal(params.get("slug"), 'not.in.("we\\"ird")');
});

test("buildDeveloperAppsQuery refuses a bad slug, a bad limit and a list over the cap", () => {
  assert.equal(buildDeveloperAppsQuery({ developerSlug: "" }), null);
  assert.equal(buildDeveloperAppsQuery({ developerSlug: "x".repeat(201) }), null);
  assert.equal(buildDeveloperAppsQuery({ developerSlug: "a", limit: 0 }), null);
  assert.equal(buildDeveloperAppsQuery({ developerSlug: "a", limit: DEVELOPER_APPS_LIMIT + 1 }), null);
  assert.equal(buildDeveloperAppsQuery({ developerSlug: "a", limit: 1.5 }), null);
  const many = Array.from({ length: COUNT_EXCLUDE_MAX + 1 }, (_, i) => `com.p${i}`);
  assert.equal(buildDeveloperAppsQuery({ developerSlug: "a", excludePackages: many }), null);
});

test("returns the rows and the developer's total from Content-Range", async () => {
  const seen: any[] = [];
  const out = await readCatalogDeveloperApps({ developerSlug: "acme", limit: 2 }, { env: ENV, fetch: fakeFetch([row("a"), row("b")], "0-1/130", seen) });
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.deepEqual(out.rows.map((r) => r.slug), ["a", "b"]);
    assert.equal(out.total, 130);
  }
  assert.ok(String(seen[0].url).startsWith("https://proj.supabase.co/rest/v1/catalog_app?"));
  assert.equal(seen[0].init.method, "GET");
  assert.equal(seen[0].init.headers.Prefer, "count=exact");
  assert.equal(seen[0].init.headers.apikey, "service-key-123");
  assert.equal(seen[0].init.redirect, "error");
});

test("a developer with no published rows is an empty answer, not a failure", async () => {
  assert.deepEqual(await readCatalogDeveloperApps({ developerSlug: "acme" }, { env: ENV, fetch: fakeFetch([], "*/0") }), { ok: true, rows: [], total: 0 });
});

test("not configured and a bad argument make no request", async () => {
  const seen: any[] = [];
  assert.deepEqual(await readCatalogDeveloperApps({ developerSlug: "acme" }, { env: {}, fetch: fakeFetch([], "*/0", seen) }), { ok: false, reason: "not_configured" });
  assert.deepEqual(await readCatalogDeveloperApps({ developerSlug: "" }, { env: ENV, fetch: fakeFetch([], "*/0", seen) }), { ok: false, reason: "unavailable" });
  assert.equal(seen.length, 0);
});

test("refuses a non-2xx answer, a missing count, more rows than asked for or than the total", async () => {
  const args = { developerSlug: "acme", limit: 1 };
  assert.deepEqual(await readCatalogDeveloperApps(args, { env: ENV, fetch: fakeFetch({ message: "x" }, null, [], 500) }), { ok: false, reason: "unavailable" });
  assert.deepEqual(await readCatalogDeveloperApps(args, { env: ENV, fetch: fakeFetch([row("a")], null) }), { ok: false, reason: "unavailable" });
  assert.deepEqual(await readCatalogDeveloperApps(args, { env: ENV, fetch: fakeFetch([row("a"), row("b")], "0-1/9") }), { ok: false, reason: "unavailable" });
  assert.deepEqual(await readCatalogDeveloperApps({ developerSlug: "acme" }, { env: ENV, fetch: fakeFetch([row("a"), row("b")], "0-1/1") }), { ok: false, reason: "unavailable" });
});

test("one malformed row, or a row of another developer, refuses the whole answer", async () => {
  const args = { developerSlug: "acme" };
  assert.deepEqual(await readCatalogDeveloperApps(args, { env: ENV, fetch: fakeFetch([row("a"), { slug: "b" }], "0-1/2") }), { ok: false, reason: "unavailable" });
  assert.deepEqual(await readCatalogDeveloperApps(args, { env: ENV, fetch: fakeFetch([row("a"), row("b", "other")], "0-1/2") }), { ok: false, reason: "unavailable" });
});

test("an oversized or unparsable answer and a thrown fetch are unavailable", async () => {
  const args = { developerSlug: "acme" };
  assert.deepEqual(await readCatalogDeveloperApps(args, { env: ENV, fetch: fakeFetch("x".repeat(CATALOG_MAX_BODY_BYTES + 1), "0-0/1") }), { ok: false, reason: "unavailable" });
  assert.deepEqual(await readCatalogDeveloperApps(args, { env: ENV, fetch: fakeFetch("not json", "0-0/1") }), { ok: false, reason: "unavailable" });
  const throwing = (async () => {
    throw new Error("boom https://secret.example");
  }) as unknown as typeof fetch;
  assert.deepEqual(await readCatalogDeveloperApps(args, { env: ENV, fetch: throwing }), { ok: false, reason: "unavailable" });
});
