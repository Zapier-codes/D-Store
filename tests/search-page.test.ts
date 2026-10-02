import assert from "node:assert/strict";
import test from "node:test";
import { readAppsPage, normalizeNeedle } from "../lib/apps-page";
import type { CatalogRow } from "../lib/catalog-table";
import type { App } from "../lib/mock-data";

// Leaf 5.l.v.zo. Written, NOT run (standing operator instruction, 2026-10-02: no testing). These
// cover the TypeScript side against a fake fetch; the SQL search was checked in 5.l.i.zo.

const ENV = { SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "service-key-123" };

function row(i: number): CatalogRow {
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
  };
}

const rows = (n: number) => Array.from({ length: n }, (_, k) => row(k + 1));

function fake(all: CatalogRow[], seen: any[] = []) {
  return (async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    seen.push({ url, body });
    let start = 0;
    if (body.p_after_slug) start = all.findIndex((r) => r.slug === body.p_after_slug) + 1;
    return new Response(JSON.stringify(all.slice(start, start + body.p_limit)), { status: 200 });
  }) as unknown as typeof fetch;
}

const fp = (pkg: string, name: string, summary = "") =>
  ({ package_name: pkg, origin: "zealot", name, summary, app_type: "app", category: "tools", updated_at: "2026-01-01" }) as unknown as App;

const pkgs = (apps: App[]) => apps.map((a) => a.package_name);

test("a search sends p_needle through catalog_page and puts matching first-party apps first", async () => {
  const seen: any[] = [];
  const out = await readAppsPage(
    {
      order: "top",
      query: "  Chat ",
      pageSize: 4,
      firstParty: [fp("first.chat", "Zealot CHAT"), fp("first.other", "Notes", "no match here"), fp("first.sum", "Mail", "a chatty app")],
    },
    { env: ENV, fetch: fake(rows(10), seen) }
  );
  assert.ok(out);
  assert.equal(seen[0].body.p_needle, "Chat");
  assert.ok(seen[0].url.endsWith("/rest/v1/rpc/catalog_page"));
  assert.deepEqual(pkgs(out.apps).slice(0, 2), ["first.chat", "first.sum"]);
  assert.ok(!pkgs(out.apps).includes("first.other"));
  assert.equal(out.apps.length, 4);
});

test("a later page of a search is third-party only and continues after the cursor", async () => {
  const f = fake(rows(20));
  const first = await readAppsPage({ order: "top", query: "app", pageSize: 3, firstParty: [fp("first.app", "App one")] }, { env: ENV, fetch: f });
  assert.ok(first && first.nextCursor);
  const second = await readAppsPage(
    { order: "top", query: "app", pageSize: 3, firstParty: [fp("first.app", "App one")], after: first.nextCursor },
    { env: ENV, fetch: f }
  );
  assert.ok(second);
  assert.equal(second.isFirstPage, false);
  assert.ok(!pkgs(second.apps).includes("first.app"));
  assert.deepEqual(pkgs(second.apps), ["com.example.app3", "com.example.app4", "com.example.app5"]);
});

test("a blank query is an empty page and makes no request", async () => {
  const seen: any[] = [];
  for (const query of ["", "   ", "\n\t"]) {
    const out = await readAppsPage({ order: "top", query, firstParty: [fp("first.one", "One")] }, { env: ENV, fetch: fake(rows(5), seen) });
    assert.deepEqual(out, { apps: [], nextCursor: null, isFirstPage: true });
  }
  assert.equal(seen.length, 0);
});

test("search cannot be combined with a category, a filter, a first-party rule or order new", async () => {
  const f = fake(rows(5));
  const base = { query: "app", firstParty: [] as App[] };
  assert.equal(await readAppsPage({ ...base, order: "top", scope: { appType: "app", category: "tools" } }, { env: ENV, fetch: f }), null);
  assert.equal(await readAppsPage({ ...base, order: "top", filter: { license: "MIT" } }, { env: ENV, fetch: f }), null);
  assert.equal(await readAppsPage({ ...base, order: "top", matchFirstParty: () => true }, { env: ENV, fetch: f }), null);
  assert.equal(await readAppsPage({ ...base, order: "new" }, { env: ENV, fetch: f }), null);
  assert.equal(await readAppsPage({ ...base, order: "top", query: 5 as any }, { env: ENV, fetch: f }), null);
  // One app type is fine.
  assert.ok(await readAppsPage({ ...base, order: "top", scope: { appType: "game" } }, { env: ENV, fetch: f }));
});

test("normalizeNeedle trims and cuts to 100 characters, as the database search does", () => {
  assert.equal(normalizeNeedle("  hello  "), "hello");
  assert.equal(normalizeNeedle(""), "");
  assert.equal(normalizeNeedle("x".repeat(150)).length, 100);
  assert.equal(normalizeNeedle(`${"x".repeat(99)} y`), "x".repeat(99));
});

test("first-party matching uses the same cut needle as the database", async () => {
  const long = "x".repeat(100);
  const out = await readAppsPage(
    { order: "top", query: `${long}EXTRA`, pageSize: 3, firstParty: [fp("first.long", `name ${long}`)] },
    { env: ENV, fetch: fake([]) }
  );
  assert.ok(out);
  assert.deepEqual(pkgs(out.apps), ["first.long"]);
});
