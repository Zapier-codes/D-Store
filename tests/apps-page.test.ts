import assert from "node:assert/strict";
import test from "node:test";
import { readAppsPage, parseAfter, APPS_PAGE_MAX_READS } from "../lib/apps-page";
import { encodeCursor, type CatalogRow } from "../lib/catalog-table";
import type { App } from "../lib/mock-data";

// Leaf 5.l.x.zi. These tests cover the TypeScript side against a fake fetch; the SQL function was
// checked in 5.l.i.zo. The fake pages by `p_after_slug` and `p_limit`, not by the SQL cursor rule.

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

const rows = (n: number, from = 1) => Array.from({ length: n }, (_, k) => row(from + k));

function fake(all: CatalogRow[], seen: any[] = [], fail = false) {
  return (async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    seen.push(body);
    if (fail) return new Response("boom", { status: 500 });
    let start = 0;
    if (body.p_after_slug) start = all.findIndex((r) => r.slug === body.p_after_slug) + 1;
    return new Response(JSON.stringify(all.slice(start, start + body.p_limit)), { status: 200 });
  }) as unknown as typeof fetch;
}

const fp = (pkg: string, over: Partial<App> = {}) =>
  ({ package_name: pkg, origin: "zealot", app_type: "app", category: "tools", updated_at: "2026-01-01", ...over }) as unknown as App;

const pkgs = (apps: App[]) => apps.map((a) => a.package_name);

test("page 1: first-party apps first, then third-party rows, total is pageSize", async () => {
  const out = await readAppsPage(
    { order: "top", pageSize: 5, firstParty: [fp("first.one"), fp("first.two")] },
    { env: ENV, fetch: fake(rows(20)) }
  );
  assert.ok(out);
  assert.equal(out.isFirstPage, true);
  assert.deepEqual(pkgs(out.apps), ["first.one", "first.two", "com.example.app1", "com.example.app2", "com.example.app3"]);
  assert.ok(out.nextCursor);
});

test("the cursor continues after the last row shown, with no first-party apps and no repeats", async () => {
  const f = fake(rows(20));
  const first = await readAppsPage({ order: "top", pageSize: 5, firstParty: [fp("first.one")] }, { env: ENV, fetch: f });
  assert.ok(first && first.nextCursor);
  const second = await readAppsPage(
    { order: "top", pageSize: 5, firstParty: [fp("first.one")], after: first.nextCursor },
    { env: ENV, fetch: f }
  );
  assert.ok(second);
  assert.equal(second.isFirstPage, false);
  assert.deepEqual(pkgs(second.apps), ["com.example.app5", "com.example.app6", "com.example.app7", "com.example.app8", "com.example.app9"]);
});

test("first-party packages are dropped from rows on every page and the page is still filled", async () => {
  const f = fake(rows(20));
  const out = await readAppsPage(
    { order: "top", pageSize: 3, firstParty: [fp("com.example.app2")] },
    { env: ENV, fetch: f }
  );
  assert.ok(out);
  // One first-party app is in scope (page 1), so two rows are wanted; app2 is skipped.
  assert.deepEqual(pkgs(out.apps), ["com.example.app2", "com.example.app1", "com.example.app3"]);
  const next = await readAppsPage(
    { order: "top", pageSize: 3, firstParty: [fp("com.example.app2")], after: out.nextCursor },
    { env: ENV, fetch: f }
  );
  assert.ok(next);
  assert.deepEqual(pkgs(next.apps), ["com.example.app4", "com.example.app5", "com.example.app6"]);
});

test("the last page has no cursor, and an exact fit does not invent a next page", async () => {
  const exact = await readAppsPage({ order: "top", pageSize: 3, firstParty: [] }, { env: ENV, fetch: fake(rows(3)) });
  assert.ok(exact);
  assert.equal(exact.apps.length, 3);
  assert.equal(exact.nextCursor, null);
  const short = await readAppsPage({ order: "top", pageSize: 5, firstParty: [] }, { env: ENV, fetch: fake(rows(2)) });
  assert.ok(short);
  assert.equal(short.apps.length, 2);
  assert.equal(short.nextCursor, null);
});

test("a bad, foreign or wrong-order `after` is a first page, not an error", async () => {
  const f = fake(rows(10));
  for (const after of ["not-a-cursor", "!!!", 42, undefined, "", encodeCursor("new", row(3))]) {
    const out = await readAppsPage({ order: "top", pageSize: 2, firstParty: [fp("first.one")], after }, { env: ENV, fetch: f });
    assert.ok(out, String(after));
    assert.equal(out.isFirstPage, true);
    assert.equal(out.apps[0].package_name, "first.one");
  }
  assert.equal(parseAfter("top", ["x"]), undefined);
  const good = encodeCursor("top", row(3))!;
  assert.equal(parseAfter("top", [good, "other"]), good);
});

test("scope is passed to the database and filters the first-party apps", async () => {
  const seen: any[] = [];
  const out = await readAppsPage(
    {
      order: "new",
      scope: { appType: "game", category: "casual" },
      pageSize: 4,
      firstParty: [fp("g.casual", { app_type: "game", category: "casual" }), fp("a.tools")],
    },
    { env: ENV, fetch: fake(rows(10), seen) }
  );
  assert.ok(out);
  assert.equal(seen[0].p_app_type, "game");
  assert.equal(seen[0].p_category, "casual");
  assert.equal(seen[0].p_order, "new");
  assert.equal(out.apps[0].package_name, "g.casual");
  assert.ok(!pkgs(out.apps).includes("a.tools"));
});

test("`new` puts first-party apps newest-updated first; `top` keeps the list order", async () => {
  const list = [fp("old", { updated_at: "2026-01-01" }), fp("new", { updated_at: "2026-09-01" })];
  const n = await readAppsPage({ order: "new", pageSize: 5, firstParty: list }, { env: ENV, fetch: fake([]) });
  const t = await readAppsPage({ order: "top", pageSize: 5, firstParty: list }, { env: ENV, fetch: fake([]) });
  assert.deepEqual(pkgs(n!.apps), ["new", "old"]);
  assert.deepEqual(pkgs(t!.apps), ["old", "new"]);
});

test("more first-party apps than pageSize still shows them all plus one row", async () => {
  const many = Array.from({ length: 5 }, (_, i) => fp(`first.${i}`));
  const out = await readAppsPage({ order: "top", pageSize: 3, firstParty: many }, { env: ENV, fetch: fake(rows(10)) });
  assert.ok(out);
  assert.equal(out.apps.length, 6);
  assert.ok(out.nextCursor);
});

test("failure, bad arguments and unfillable pages are null, never a partial page", async () => {
  const env = { env: ENV };
  assert.equal(await readAppsPage({ order: "top", firstParty: [] }, { ...env, fetch: fake(rows(5), [], true) }), null);
  assert.equal(await readAppsPage({ order: "top", firstParty: [] }, {}), null); // not configured
  for (const pageSize of [0, -1, 1.5, 101, NaN]) {
    assert.equal(await readAppsPage({ order: "top", pageSize, firstParty: [] }, { ...env, fetch: fake(rows(5)) }), null);
  }
  assert.equal(await readAppsPage({ order: "bogus" as any, firstParty: [] }, { ...env, fetch: fake(rows(5)) }), null);
  // Every row collides with a first-party package: it cannot fill within the read bound.
  const all = rows(APPS_PAGE_MAX_READS * 200);
  const blockers = all.map((r) => fp(r.package_name, { origin: "aptoide" as any }));
  assert.equal(await readAppsPage({ order: "top", pageSize: 2, firstParty: blockers }, { ...env, fetch: fake(all) }), null);
});

test("a throwing fetch is null, not an exception", async () => {
  const f = (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
  assert.equal(await readAppsPage({ order: "top", firstParty: [] }, { env: ENV, fetch: f }), null);
});

// Leaf 5.l.x.zo: the rank offset in the URL is display only.
import { parseRankOffset, RANK_OFFSET_MAX } from "../lib/apps-page";

test("parseRankOffset: whole numbers on a later page, 0 for everything else, always 0 on page 1", () => {
  assert.equal(parseRankOffset("24", false), 24);
  assert.equal(parseRankOffset(["48", "7"], false), 48);
  assert.equal(parseRankOffset("0", false), 0);
  assert.equal(parseRankOffset(String(RANK_OFFSET_MAX), false), RANK_OFFSET_MAX);
  assert.equal(parseRankOffset(String(RANK_OFFSET_MAX + 1), false), 0);
  for (const bad of [undefined, "", "-5", "1.5", "1e3", "abc", "99999999", " 4", "0x10", 24, null]) {
    assert.equal(parseRankOffset(bad, false), 0, String(bad));
  }
  assert.equal(parseRankOffset("24", true), 0);
});
