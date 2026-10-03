import { test } from "node:test";
import assert from "node:assert/strict";
import { handleCatalog, toApiApp, CATALOG_API_DEFAULT_LIMIT } from "../lib/catalog-api";
import type { CatalogRow, CatalogPageResult } from "../lib/catalog-table";

function row(over: Partial<CatalogRow> = {}): CatalogRow {
  return {
    id: "1", slug: "a-app", package_name: "com.a", origin: "aptoide", name: "A", summary: "s", icon: "https://x/i.png",
    version: "1.0", app_type: "app", category: "tools", developer_slug: "dev", developer_name: "Dev", license: "Freeware",
    size_mb: 3, download_url: "https://x/a.apk", reported_downloads: 10, source_created_at: "2026-01-01T00:00:00Z",
    source_updated_at: "2026-02-01T00:00:00Z", ...over,
  };
}

function fakes(result: CatalogPageResult = { ok: true, rows: [row()], nextCursor: "cur" }) {
  const calls: { kind: string; args: any }[] = [];
  return {
    calls,
    deps: {
      readPage: async (args: any) => { calls.push({ kind: "read", args }); return result; },
      searchPage: async (args: any) => { calls.push({ kind: "search", args }); return result; },
    } as any,
  };
}

const get = (qs = "") => new Request(`https://d.test/api/catalog${qs}`);

test("200: apps are mapped, the cursor is passed through, the default limit and order apply", async () => {
  const f = fakes();
  const res = await handleCatalog(get(), f.deps);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control") ?? "", /^public/);
  const body: any = await res.json();
  assert.equal(body.next_cursor, "cur");
  assert.deepEqual(body.apps[0].developer, { slug: "dev", name: "Dev" });
  assert.equal(body.apps[0].updated_at, "2026-02-01T00:00:00Z");
  assert.equal(f.calls[0].kind, "read");
  assert.equal(f.calls[0].args.order, "top");
  assert.equal(f.calls[0].args.limit, CATALOG_API_DEFAULT_LIMIT);
});

test("the query reaches the reader: order, type, category, limit and cursor", async () => {
  const f = fakes();
  await handleCatalog(get("?order=new&type=game&category=action&limit=7&cursor=abc"), f.deps);
  assert.deepEqual(f.calls[0].args, { order: "new", appType: "game", category: "action", cursor: "abc", limit: 7 });
});

test("q searches (top order, with an optional type) and never calls the list reader", async () => {
  const f = fakes();
  await handleCatalog(get("?q=maps&type=app&limit=5"), f.deps);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].kind, "search");
  assert.deepEqual(f.calls[0].args, { query: "maps", appType: "app", cursor: undefined, limit: 5 });
});

test("400 for bad queries, checked before any reader call", async () => {
  for (const qs of [
    "?order=sideways", "?type=tv", "?category=tools", "?type=app&category=", "?limit=0", "?limit=101", "?limit=abc", "?limit=-1",
    "?limit=1&limit=2", "?q=a&order=new", "?q=a&type=app&category=tools", "?cursor=a&cursor=b",
  ]) {
    const f = fakes();
    const res = await handleCatalog(get(qs), f.deps);
    assert.equal(res.status, 400, qs);
    assert.equal(f.calls.length, 0, qs);
    assert.equal(res.headers.get("cache-control"), "no-store");
  }
});

test("the reader's failures map to fixed statuses and bodies that echo nothing", async () => {
  const cases: [CatalogPageResult, number][] = [
    [{ ok: false, reason: "invalid_input" }, 400],
    [{ ok: false, reason: "not_configured" }, 503],
    [{ ok: false, reason: "unavailable" }, 502],
  ];
  for (const [result, status] of cases) {
    const res = await handleCatalog(get("?cursor=SECRETISH"), fakes(result).deps);
    assert.equal(res.status, status);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.ok(!JSON.stringify(await res.json()).includes("SECRETISH"));
  }
});

test("an empty last page is a 200 with no apps and a null cursor", async () => {
  const res = await handleCatalog(get(), fakes({ ok: true, rows: [], nextCursor: null }).deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { apps: [], next_cursor: null });
});

test("download_url is passed through only when it is https", () => {
  assert.equal(toApiApp(row({ download_url: "https://x/a.apk" })).download_url, "https://x/a.apk");
  assert.equal(toApiApp(row({ download_url: "http://x/a.apk" })).download_url, null);
  assert.equal(toApiApp(row({ download_url: "javascript:alert(1)" })).download_url, null);
  assert.equal(toApiApp(row({ download_url: "" })).download_url, null);
});

test("a row's raw or internal columns never appear in the answer", () => {
  const app: any = toApiApp({ ...row(), raw: { secret: 1 }, id: "internal" } as any);
  assert.ok(!("raw" in app));
  assert.ok(!("id" in app));
});
