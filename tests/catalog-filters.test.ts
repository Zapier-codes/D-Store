import assert from "node:assert/strict";
import test from "node:test";
import { readCatalogPage, readCatalogLicenses, CATALOG_LICENSE_MAX_CHARS, CATALOG_SIZE_MAX_MB } from "../lib/catalog-table";
import { readAppsPage } from "../lib/apps-page";
import type { CatalogRow } from "../lib/catalog-table";
import type { App } from "../lib/mock-data";

// Leaf 5.l.xii.zo. Written, NOT run (standing operator instruction, 2026-10-02: no testing). These
// cover the TypeScript side against a fake fetch; the SQL (20261002020000_catalog_page_filters.sql)
// has not been run against a database either, and the operator applies it.

const ENV = { SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "service-key-123" };

function row(i: number, over: Partial<CatalogRow> = {}): CatalogRow {
  return {
    id: `aptoide-${i}`,
    slug: `app-${String(i).padStart(4, "0")}`,
    package_name: `com.example.app${i}`,
    origin: "aptoide",
    name: `App ${i}`,
    summary: `Summary ${i}`,
    icon: "https://img.example/i.png",
    version: "1.0",
    app_type: "app",
    category: "tools",
    developer_slug: "dev",
    developer_name: "Dev",
    license: "Not provided",
    size_mb: 12.3,
    download_url: "https://dl.example/a.apk",
    reported_downloads: 5000 - i,
    source_created_at: "2026-01-01T00:00:00+00:00",
    source_updated_at: "2026-09-10T12:00:00+00:00",
    ...over,
  };
}

function recorder(answer: unknown, seen: { url: string; body: any }[], status = 200) {
  return (async (url: string, init: any) => {
    seen.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(answer), { status });
  }) as unknown as typeof fetch;
}

test("a call without filters sends neither new argument", async () => {
  const seen: { url: string; body: any }[] = [];
  const out = await readCatalogPage({ order: "top", appType: "app", category: "tools" }, { env: ENV, fetch: recorder([row(1)], seen) });
  assert.equal(out.ok, true);
  assert.ok(!("p_license" in seen[0].body));
  assert.ok(!("p_max_size_mb" in seen[0].body));
});

test("filters are sent as p_license and p_max_size_mb", async () => {
  const seen: { url: string; body: any }[] = [];
  await readCatalogPage(
    { order: "top", appType: "app", category: "tools", license: "GPL-3.0", maxSizeMb: 5 },
    { env: ENV, fetch: recorder([], seen) }
  );
  assert.equal(seen[0].body.p_license, "GPL-3.0");
  assert.equal(seen[0].body.p_max_size_mb, 5);
});

test("a bad license or size is invalid_input and makes no request", async () => {
  const seen: { url: string; body: any }[] = [];
  const f = recorder([], seen);
  const bad: Array<Record<string, unknown>> = [
    { license: "" },
    { license: "   " },
    { license: "x".repeat(CATALOG_LICENSE_MAX_CHARS + 1) },
    { license: "a\u0000b" },
    { license: 5 },
    { maxSizeMb: -1 },
    { maxSizeMb: NaN },
    { maxSizeMb: Infinity },
    { maxSizeMb: CATALOG_SIZE_MAX_MB + 1 },
    { maxSizeMb: "5" },
  ];
  for (const extra of bad) {
    const out = await readCatalogPage({ order: "top", ...(extra as object) } as any, { env: ENV, fetch: f });
    assert.deepEqual(out, { ok: false, reason: "invalid_input" }, JSON.stringify(extra));
  }
  assert.equal(seen.length, 0);
  const zero = await readCatalogPage({ order: "top", maxSizeMb: 0 }, { env: ENV, fetch: recorder([], seen) });
  assert.equal(zero.ok, true);
});

test("readCatalogLicenses returns the list, and asks with the pair only", async () => {
  const seen: { url: string; body: any }[] = [];
  const out = await readCatalogLicenses(
    { appType: "app", category: "tools" },
    { env: ENV, fetch: recorder([{ license: "Apache-2.0" }, { license: "GPL-3.0" }], seen) }
  );
  assert.deepEqual(out, { ok: true, licenses: ["Apache-2.0", "GPL-3.0"] });
  assert.ok(seen[0].url.endsWith("/rest/v1/rpc/catalog_licenses"));
  assert.deepEqual(seen[0].body, { p_app_type: "app", p_category: "tools" });
});

test("readCatalogLicenses refuses bad input, a failed call and any malformed answer", async () => {
  const seen: { url: string; body: any }[] = [];
  assert.deepEqual(await readCatalogLicenses({ appType: "x" as any, category: "tools" }, { env: ENV, fetch: recorder([], seen) }), {
    ok: false,
    reason: "invalid_input",
  });
  assert.deepEqual(await readCatalogLicenses({ appType: "app", category: "Bad Slug" }, { env: ENV, fetch: recorder([], seen) }), {
    ok: false,
    reason: "invalid_input",
  });
  assert.equal(seen.length, 0);
  assert.deepEqual(await readCatalogLicenses({ appType: "app", category: "tools" }, {}), { ok: false, reason: "not_configured" });
  // The function not existing (migration not applied) is a 404 from PostgREST.
  assert.deepEqual(await readCatalogLicenses({ appType: "app", category: "tools" }, { env: ENV, fetch: recorder({}, seen, 404) }), {
    ok: false,
    reason: "unavailable",
  });
  for (const answer of [{ license: "x" }, [{ license: "" }], [{ nope: "x" }], [{ license: "a".repeat(101) }], ["GPL"], [null], Array.from({ length: 101 }, () => ({ license: "x" }))]) {
    const out = await readCatalogLicenses({ appType: "app", category: "tools" }, { env: ENV, fetch: recorder(answer, seen) });
    assert.deepEqual(out, { ok: false, reason: "unavailable" }, JSON.stringify(answer).slice(0, 40));
  }
});

const fp = (pkg: string, over: Partial<App> = {}) =>
  ({ package_name: pkg, origin: "zealot", app_type: "app", category: "tools", license: "GPL-3.0", size_mb: 2, updated_at: "2026-01-01", ...over }) as unknown as App;

test("readAppsPage applies the filter to first-party apps and passes it to the database", async () => {
  const seen: { url: string; body: any }[] = [];
  const out = await readAppsPage(
    {
      order: "top",
      scope: { appType: "app", category: "tools" },
      pageSize: 5,
      firstParty: [
        fp("keep"),
        fp("wrong.license", { license: "MIT" }),
        fp("too.big", { size_mb: 9 }),
      ],
      filter: { license: "GPL-3.0", maxSizeMb: 5 },
    },
    { env: ENV, fetch: recorder([row(1)], seen) }
  );
  assert.ok(out);
  const pkgs = out.apps.map((a) => a.package_name);
  assert.ok(pkgs.includes("keep"));
  assert.ok(!pkgs.includes("wrong.license"));
  assert.ok(!pkgs.includes("too.big"));
  assert.equal(seen[0].body.p_license, "GPL-3.0");
  assert.equal(seen[0].body.p_max_size_mb, 5);
});
