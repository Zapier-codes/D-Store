import assert from "node:assert/strict";
import test from "node:test";
import {
  CATEGORY_ROWS_CONCURRENCY,
  CATEGORY_ROWS_MAX,
  readCategoryRows,
  type CategoryRowSpec,
} from "../lib/catalog-category-rows";
import { SHELF_MAX, SHELF_MAX_PAGES } from "../lib/catalog-shelf";
import type { CatalogRow } from "../lib/catalog-table";
import type { App } from "../lib/mock-data";

// Leaf 5.l.ix.zi. Written, NOT run (standing operator instruction, 2026-10-02). These tests cover the
// TypeScript side against a fake fetch; the SQL function was checked in 5.l.i.zo.

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

/** Answers each RPC from a per-(type/category) list of rows; the function itself pages by `p_limit`. */
function fakeCatalog(byKey: Record<string, CatalogRow[]>, seen: any[] = [], fail?: (key: string) => boolean) {
  return (async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    const key = `${body.p_app_type}/${body.p_category}`;
    seen.push({ key, body });
    if (fail?.(key)) return new Response("boom", { status: 500 });
    const all = byKey[key] ?? [];
    let start = 0;
    if (body.p_after_slug) start = all.findIndex((r) => r.slug === body.p_after_slug) + 1;
    return new Response(JSON.stringify(all.slice(start, start + body.p_limit)), { status: 200 });
  }) as unknown as typeof fetch;
}

const rows = (n: number, from = 1, over: Partial<CatalogRow> = {}) =>
  Array.from({ length: n }, (_, k) => row(from + k, over));

const firstParty = (pkg: string) => ({ package_name: pkg }) as unknown as App;

test("returns the top N of each category, keyed by the pair, in input order", async () => {
  const seen: any[] = [];
  const f = fakeCatalog(
    { "app/tools": rows(10), "game/sports": rows(10, 100, { app_type: "game", category: "sports" }) },
    seen
  );
  const specs: CategoryRowSpec[] = [
    { appType: "game", category: "sports" },
    { appType: "app", category: "tools" },
  ];
  const out = await readCategoryRows(specs, 3, [], { env: ENV, fetch: f });
  assert.ok(out);
  assert.deepEqual(out.map((r) => `${r.appType}/${r.category}`), ["game/sports", "app/tools"]);
  assert.deepEqual(out[0].apps.map((a) => a.package_name), ["com.example.app100", "com.example.app101", "com.example.app102"]);
  assert.equal(out[1].apps.length, 3);
  for (const call of seen) {
    assert.equal(call.body.p_order, "top");
    assert.ok(call.body.p_app_type && call.body.p_category);
  }
});

test("a category with no apps is a row with an empty list, not an error and not omitted", async () => {
  const f = fakeCatalog({ "app/tools": rows(2) });
  const out = await readCategoryRows(
    [{ appType: "app", category: "tools" }, { appType: "app", category: "weather" }],
    5,
    [],
    { env: ENV, fetch: f }
  );
  assert.ok(out);
  assert.equal(out.length, 2);
  assert.equal(out[0].apps.length, 2);
  assert.deepEqual(out[1], { appType: "app", category: "weather", apps: [] });
});

test("first-party packages are dropped and the row is still filled", async () => {
  const f = fakeCatalog({ "app/tools": rows(10) });
  const out = await readCategoryRows([{ appType: "app", category: "tools" }], 3, [firstParty("com.example.app1")], {
    env: ENV,
    fetch: f,
  });
  assert.ok(out);
  assert.deepEqual(out[0].apps.map((a) => a.package_name), ["com.example.app2", "com.example.app3", "com.example.app4"]);
});

test("a repeated pair is read once and keeps its first position", async () => {
  const seen: any[] = [];
  const f = fakeCatalog({ "app/tools": rows(5), "app/weather": rows(5, 50) }, seen);
  const out = await readCategoryRows(
    [
      { appType: "app", category: "tools" },
      { appType: "app", category: "weather" },
      { appType: "app", category: "tools" },
    ],
    2,
    [],
    { env: ENV, fetch: f }
  );
  assert.ok(out);
  assert.deepEqual(out.map((r) => r.category), ["tools", "weather"]);
  assert.equal(seen.length, 2);
});

test("`sports` as an app category and as a game genre stay separate rows", async () => {
  const f = fakeCatalog({
    "app/sports": rows(2, 1, { category: "sports" }),
    "game/sports": rows(2, 10, { app_type: "game", category: "sports" }),
  });
  const out = await readCategoryRows(
    [{ appType: "app", category: "sports" }, { appType: "game", category: "sports" }],
    5,
    [],
    { env: ENV, fetch: f }
  );
  assert.ok(out);
  assert.equal(out.length, 2);
  assert.ok(out[0].apps.every((a) => a.app_type === "app"));
  assert.ok(out[1].apps.every((a) => a.app_type === "game"));
});

test("any failed read refuses the whole answer; no partial result", async () => {
  const f = fakeCatalog({ "app/tools": rows(5), "app/weather": rows(5, 50) }, [], (k) => k === "app/weather");
  const out = await readCategoryRows(
    [{ appType: "app", category: "tools" }, { appType: "app", category: "weather" }],
    2,
    [],
    { env: ENV, fetch: f }
  );
  assert.equal(out, null);
});

test("not configured is null and makes no request", async () => {
  let called = false;
  const f = (async () => ((called = true), new Response("[]"))) as unknown as typeof fetch;
  const out = await readCategoryRows([{ appType: "app", category: "tools" }], 3, [], { env: {}, fetch: f });
  assert.equal(out, null);
  assert.equal(called, false);
});

test("bad arguments are null and make no request", async () => {
  let calls = 0;
  const f = (async () => ((calls += 1), new Response("[]"))) as unknown as typeof fetch;
  const deps = { env: ENV, fetch: f };
  const ok: CategoryRowSpec[] = [{ appType: "app", category: "tools" }];
  const tooMany = Array.from({ length: CATEGORY_ROWS_MAX + 1 }, (_, i) => ({ appType: "app" as const, category: `c${i}` }));

  assert.equal(await readCategoryRows(tooMany, 3, [], deps), null);
  assert.equal(await readCategoryRows(ok, -1, [], deps), null);
  assert.equal(await readCategoryRows(ok, 1.5, [], deps), null);
  assert.equal(await readCategoryRows(ok, SHELF_MAX + 1, [], deps), null);
  assert.equal(await readCategoryRows(ok, Number.NaN, [], deps), null);
  assert.equal(await readCategoryRows([{ appType: "tv" as any, category: "tools" }], 3, [], deps), null);
  assert.equal(await readCategoryRows([{ appType: "app", category: "" }], 3, [], deps), null);
  assert.equal(await readCategoryRows([{ appType: "app", category: 7 as any }], 3, [], deps), null);
  assert.equal(await readCategoryRows([null as any], 3, [], deps), null);
  assert.equal(await readCategoryRows("tools" as any, 3, [], deps), null);
  assert.equal(calls, 0);
});

test("a category slug the table reader rejects is null, not a throw", async () => {
  const f = fakeCatalog({});
  const out = await readCategoryRows([{ appType: "app", category: "Not A Slug!" }], 3, [], { env: ENV, fetch: f });
  assert.equal(out, null);
});

test("zero apps per category, and zero categories, make no request", async () => {
  let calls = 0;
  const f = (async () => ((calls += 1), new Response("[]"))) as unknown as typeof fetch;
  const deps = { env: ENV, fetch: f };
  assert.deepEqual(await readCategoryRows([], 3, [], deps), []);
  assert.deepEqual(await readCategoryRows([{ appType: "app", category: "tools" }], 0, [], deps), [
    { appType: "app", category: "tools", apps: [] },
  ]);
  assert.equal(calls, 0);
});

test("a category that runs out of pages while rows keep colliding is refused, not returned short", async () => {
  // Every row collides with a first-party package, so the row can never fill and more pages always exist.
  const colliding = rows(450);
  const fp = colliding.map((r) => firstParty(r.package_name));
  const seen: any[] = [];
  const f = fakeCatalog({ "app/tools": colliding }, seen);
  const out = await readCategoryRows([{ appType: "app", category: "tools" }], 5, fp, {
    env: ENV,
    fetch: f,
  });
  assert.equal(out, null);
  assert.equal(seen.length, SHELF_MAX_PAGES);
});

test("at most CATEGORY_ROWS_CONCURRENCY reads are in flight at once", async () => {
  let inFlight = 0;
  let peak = 0;
  const f = (async (_url: string, init: any) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    const body = JSON.parse(init.body);
    return new Response(JSON.stringify(rows(2, body.p_category.length * 100).slice(0, body.p_limit)), { status: 200 });
  }) as unknown as typeof fetch;
  const specs = Array.from({ length: 12 }, (_, i) => ({ appType: "app" as const, category: `cat-${i}` }));
  const out = await readCategoryRows(specs, 2, [], { env: ENV, fetch: f });
  assert.ok(out);
  assert.equal(out.length, 12);
  assert.ok(peak <= CATEGORY_ROWS_CONCURRENCY, `peak ${peak}`);
});

test("a failure stops further categories from starting", async () => {
  const seen: any[] = [];
  const f = fakeCatalog({}, seen, () => true);
  const specs = Array.from({ length: CATEGORY_ROWS_MAX }, (_, i) => ({ appType: "app" as const, category: `cat-${i}` }));
  const out = await readCategoryRows(specs, 2, [], { env: ENV, fetch: f });
  assert.equal(out, null);
  assert.ok(seen.length <= CATEGORY_ROWS_CONCURRENCY * 2, `${seen.length} reads after the first failure`);
});

test("the error path logs nothing and puts no key in the result", async () => {
  const logs: string[] = [];
  const orig = { e: console.error, w: console.warn, l: console.log };
  console.error = console.warn = console.log = (...a: unknown[]) => void logs.push(a.join(" "));
  try {
    const f = fakeCatalog({}, [], () => true);
    const out = await readCategoryRows([{ appType: "app", category: "tools" }], 2, [], { env: ENV, fetch: f });
    assert.equal(out, null);
  } finally {
    console.error = orig.e;
    console.warn = orig.w;
    console.log = orig.l;
  }
  assert.ok(!logs.some((l) => l.includes("service-key-123")));
});
