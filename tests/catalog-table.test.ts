import assert from "node:assert/strict";
import test from "node:test";
import {
  CATALOG_MAX_BODY_BYTES,
  decodeCursor,
  encodeCursor,
  isCatalogTableConfigured,
  readCatalogPage,
  searchCatalogPage,
  type CatalogRow,
} from "../lib/catalog-table";

// Leaf 5.l.i.zo. The SQL function itself was checked in a real PostgreSQL 16 (see HANDOVER.md);
// these tests cover the TypeScript side against a fake fetch.

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
    category: "uncategorized",
    developer_slug: "dev",
    developer_name: "Dev",
    license: "Not provided",
    size_mb: 12.3,
    download_url: "https://dl.example/a.apk",
    reported_downloads: 5000 - i,
    source_created_at: "2026-01-01T00:00:00+00:00",
    source_updated_at: `2026-09-${String(10 + (i % 15)).padStart(2, "0")}T12:00:00+00:00`,
    ...over,
  };
}
const rows = (n: number, from = 1) => Array.from({ length: n }, (_, k) => row(from + k));

function fakeFetch(res: { status?: number; body?: unknown; text?: string } | Error, seen: any[] = []) {
  return (async (url: string, init: any) => {
    seen.push({ url, init, body: init?.body ? JSON.parse(init.body) : undefined });
    if (res instanceof Error) throw res;
    return new Response(res.text ?? JSON.stringify(res.body ?? []), { status: res.status ?? 200 });
  }) as unknown as typeof fetch;
}

function quiet<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void logs.push(a.join(" "));
  return fn().then((result) => ({ result, logs })).finally(() => (console.error = orig));
}

test("not configured: no request is made, for a read and a search", async () => {
  let called = false;
  const f = (async () => ((called = true), new Response("[]"))) as unknown as typeof fetch;
  assert.deepEqual(await readCatalogPage({ order: "top" }, { env: {}, fetch: f }), { ok: false, reason: "not_configured" });
  assert.deepEqual(await searchCatalogPage({ query: "chat" }, { env: {}, fetch: f }), { ok: false, reason: "not_configured" });
  assert.equal(called, false);
  assert.equal(isCatalogTableConfigured({}), false);
  assert.equal(isCatalogTableConfigured(ENV), true);
  for (const url of ["http://proj.supabase.co", "https://u:p@proj.supabase.co", "nonsense"]) {
    assert.equal(isCatalogTableConfigured({ ...ENV, SUPABASE_URL: url }), false);
  }
  assert.equal(isCatalogTableConfigured({ ...ENV, SUPABASE_URL: "http://127.0.0.1:54321" }), true);
});

test("invalid input is refused before any request, and before the config is looked at", async () => {
  let called = false;
  const f = (async () => ((called = true), new Response("[]"))) as unknown as typeof fetch;
  const deps = { env: ENV, fetch: f };
  const good = encodeCursor("top", row(1))!;
  const bad: Array<() => Promise<unknown>> = [
    () => readCatalogPage({ order: "best" as any }, deps),
    () => readCatalogPage(undefined as any, deps),
    () => readCatalogPage({ order: "top", appType: "tv" as any }, deps),
    () => readCatalogPage({ order: "top", category: "tools" }, deps), // category needs an app type
    () => readCatalogPage({ order: "top", appType: "app", category: "Tools" }, deps),
    () => readCatalogPage({ order: "top", appType: "app", category: "a/b" }, deps),
    () => readCatalogPage({ order: "top", appType: "app", category: "x".repeat(65) }, deps),
    () => readCatalogPage({ order: "top", limit: 0 }, deps),
    () => readCatalogPage({ order: "top", limit: 101 }, deps),
    () => readCatalogPage({ order: "top", limit: 1.5 }, deps),
    () => readCatalogPage({ order: "top", limit: "5" as any }, deps),
    () => readCatalogPage({ order: "top", cursor: "garbage" }, deps),
    () => readCatalogPage({ order: "top", cursor: "" }, deps),
    () => readCatalogPage({ order: "new", cursor: good }, deps), // a top cursor on the new order
    () => searchCatalogPage({ query: 5 as any }, deps),
    () => searchCatalogPage({ query: "x", appType: "tv" as any }, deps),
    () => searchCatalogPage({ query: "x", limit: 0 }, deps),
    () => searchCatalogPage({ query: "x", cursor: "garbage" }, deps),
  ];
  for (const call of bad) assert.deepEqual(await call(), { ok: false, reason: "invalid_input" });
  assert.equal(called, false);
  // validation comes first: a bad argument with no config is invalid_input, not not_configured
  assert.deepEqual(await readCatalogPage({ order: "x" as any }, { env: {} }), { ok: false, reason: "invalid_input" });
});

test("a blank or whitespace search is an empty page and makes no request", async () => {
  let called = false;
  const f = (async () => ((called = true), new Response("[]"))) as unknown as typeof fetch;
  for (const query of ["", "   ", "\n\t "]) {
    assert.deepEqual(await searchCatalogPage({ query }, { env: ENV, fetch: f }), { ok: true, rows: [], nextCursor: null });
  }
  assert.equal(called, false);
});

test("first page: the request goes to the catalog_page function with named arguments and limit + 1", async () => {
  const seen: any[] = [];
  const r = await readCatalogPage({ order: "top" }, { env: ENV, fetch: fakeFetch({ body: rows(3) }, seen) });
  assert.equal(r.ok, true);
  assert.equal(seen[0].url, "https://proj.supabase.co/rest/v1/rpc/catalog_page");
  assert.equal(seen[0].init.method, "POST");
  assert.equal(seen[0].init.headers.apikey, "service-key-123");
  assert.equal(seen[0].init.headers.Authorization, "Bearer service-key-123");
  assert.equal(seen[0].init.redirect, "error");
  assert.equal(seen[0].init.cache, "no-store");
  assert.deepEqual(seen[0].body, { p_order: "top", p_limit: 25 }); // undefined arguments are not sent
});

test("scope, cursor and limit become the function's arguments", async () => {
  const seen: any[] = [];
  const cursor = encodeCursor("new", row(7, { source_updated_at: "2026-09-12T08:30:15.123456+00:00" }))!;
  await readCatalogPage(
    { order: "new", appType: "game", category: "puzzle", cursor, limit: 10 },
    { env: ENV, fetch: fakeFetch({ body: [] }, seen) },
  );
  assert.deepEqual(seen[0].body, {
    p_order: "new",
    p_app_type: "game",
    p_category: "puzzle",
    p_after_value: "2026-09-12T08:30:15.123456+00:00",
    p_after_slug: "app-0007",
    p_limit: 11,
  });
});

test("a full page of limit + 1 rows is trimmed and returns a cursor for the last kept row", async () => {
  const seen: any[] = [];
  const f = fakeFetch({ body: rows(25) }, seen);
  const r = await readCatalogPage({ order: "top" }, { env: ENV, fetch: f });
  assert.ok(r.ok);
  assert.equal(r.rows.length, 24);
  assert.equal(r.rows[23].slug, "app-0024");
  assert.deepEqual(decodeCursor("top", r.nextCursor), { value: String(5000 - 24), slug: "app-0024" });

  // following the cursor sends exactly that row's sort value and slug
  await readCatalogPage({ order: "top", cursor: r.nextCursor! }, { env: ENV, fetch: f });
  assert.equal(seen[1].body.p_after_value, String(5000 - 24));
  assert.equal(seen[1].body.p_after_slug, "app-0024");
});

test("fewer than limit + 1 rows is the last page: no cursor", async () => {
  for (const n of [0, 1, 24]) {
    const r = await readCatalogPage({ order: "top" }, { env: ENV, fetch: fakeFetch({ body: rows(n) }) });
    assert.ok(r.ok);
    assert.equal(r.rows.length, n);
    assert.equal(r.nextCursor, null);
  }
});

test("a custom limit is respected for the trim", async () => {
  const r = await readCatalogPage({ order: "new", limit: 5 }, { env: ENV, fetch: fakeFetch({ body: rows(6) }) });
  assert.ok(r.ok);
  assert.equal(r.rows.length, 5);
  assert.ok(decodeCursor("new", r.nextCursor));
});

test("the top cursor counts a null download figure as -1, the way the database orders it", async () => {
  const last = row(24, { reported_downloads: null });
  const r = await readCatalogPage({ order: "top" }, { env: ENV, fetch: fakeFetch({ body: [...rows(23), last, row(25)] }) });
  assert.ok(r.ok);
  assert.deepEqual(decodeCursor("top", r.nextCursor), { value: "-1", slug: "app-0024" });
  // and 0 stays 0, distinct from null
  assert.equal(decodeCursor("top", encodeCursor("top", row(1, { reported_downloads: 0 })))!.value, "0");
});

test("search sends the trimmed needle (capped at 100 characters) and uses the top order", async () => {
  const seen: any[] = [];
  await searchCatalogPage({ query: "  Whats_App%  ", appType: "app" }, { env: ENV, fetch: fakeFetch({ body: [] }, seen) });
  // wildcards are not escaped here; the SQL function does that
  assert.deepEqual(seen[0].body, { p_order: "top", p_app_type: "app", p_needle: "Whats_App%", p_limit: 25 });

  await searchCatalogPage({ query: "é".repeat(300) }, { env: ENV, fetch: fakeFetch({ body: [] }, seen) });
  assert.equal(Array.from(seen[1].body.p_needle).length, 100);
});

test("search pages with a top cursor", async () => {
  const seen: any[] = [];
  const f = fakeFetch({ body: rows(25) }, seen);
  const first = await searchCatalogPage({ query: "chat" }, { env: ENV, fetch: f });
  assert.ok(first.ok && first.nextCursor);
  await searchCatalogPage({ query: "chat", cursor: first.nextCursor }, { env: ENV, fetch: f });
  assert.equal(seen[1].body.p_after_slug, "app-0024");
  assert.equal(seen[1].body.p_needle, "chat");
});

test("any failure is unavailable, with no body, cursor or key in the log", async () => {
  const cursor = encodeCursor("top", row(3))!;
  const cases: Array<{ name: string; res: Parameters<typeof fakeFetch>[0] }> = [
    { name: "500", res: { status: 500, text: "secret-row-detail service-key-123" } },
    { name: "401", res: { status: 401, text: "{}" } },
    { name: "redirect", res: { status: 302, text: "" } },
    { name: "network", res: new Error("connect ECONNREFUSED https://proj.supabase.co service-key-123") },
    { name: "not json", res: { text: "<html>" } },
    { name: "object, not array", res: { body: { rows: [] } } },
    { name: "too many rows", res: { body: rows(26) } },
    { name: "oversized", res: { text: " ".repeat(CATALOG_MAX_BODY_BYTES + 1) } },
  ];
  for (const c of cases) {
    const { result, logs } = await quiet(() => readCatalogPage({ order: "top", cursor }, { env: ENV, fetch: fakeFetch(c.res) }));
    assert.deepEqual(result, { ok: false, reason: "unavailable" }, c.name);
    const text = logs.join("\n");
    assert.ok(text.startsWith("catalog-table:"), c.name);
    for (const secret of ["service-key-123", "secret-row-detail", cursor, "proj.supabase.co"]) {
      assert.ok(!text.includes(secret), `${c.name} must not log ${secret}`);
    }
  }
});

test("one malformed row refuses the whole page, never a partial one", async () => {
  const good = rows(3);
  const broken: unknown[] = [
    { ...good[1], slug: "bad/slug" },
    { ...good[1], size_mb: "12" },
    { ...good[1], size_mb: -1 },
    { ...good[1], reported_downloads: 1.5 },
    { ...good[1], reported_downloads: "10" },
    { ...good[1], origin: "other" },
    { ...good[1], app_type: "tv" },
    { ...good[1], name: undefined },
    { ...good[1], source_updated_at: null },
    null,
    "row",
  ];
  for (const b of broken) {
    const { result } = await quiet(() =>
      readCatalogPage({ order: "top" }, { env: ENV, fetch: fakeFetch({ body: [good[0], b, good[2]] }) }),
    );
    assert.deepEqual(result, { ok: false, reason: "unavailable" }, JSON.stringify(b));
  }
});

test("a null download figure and the raw column: rows keep null and never carry raw", async () => {
  const withRaw = { ...row(1, { reported_downloads: null }), raw: { big: "payload" } };
  const r = await readCatalogPage({ order: "top" }, { env: ENV, fetch: fakeFetch({ body: [withRaw] }) });
  assert.ok(r.ok);
  assert.equal(r.rows[0].reported_downloads, null);
  assert.equal("raw" in r.rows[0], false);
});

test("cursors: round trip, bound to their order, and every tampered form is refused", () => {
  const top = encodeCursor("top", row(5))!;
  const nw = encodeCursor("new", row(5))!;
  assert.deepEqual(decodeCursor("top", top), { value: "4995", slug: "app-0005" });
  assert.deepEqual(decodeCursor("new", nw), { value: row(5).source_updated_at, slug: "app-0005" });
  assert.equal(decodeCursor("new", top), null);
  assert.equal(decodeCursor("top", nw), null);

  const forge = (o: unknown) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
  const refused = [
    undefined, null, 5, "", "!!!", "a".repeat(601),
    forge(null), forge([]), forge({}),
    forge({ o: "top", v: "-2", s: "ok" }),
    forge({ o: "top", v: "1e5", s: "ok" }),
    forge({ o: "top", v: "1; drop table catalog_app", s: "ok" }),
    forge({ o: "top", v: "5", s: "../x" }),
    forge({ o: "top", v: "5", s: "" }),
    forge({ o: "top", v: 5, s: "ok" }),
    forge({ o: "new", v: "yesterday", s: "ok" }),
    forge({ o: "new", v: "2026-13-45T99:99:99Z", s: "ok" }),
    forge({ o: "new", v: "2026-09-12T08:30:15", s: "ok" }), // no zone
    forge({ o: "top", v: "5", s: "x".repeat(201) }),
  ];
  for (const bad of refused) assert.equal(decodeCursor("top", bad) ?? decodeCursor("new", bad), null, String(bad));
  // a row that cannot make a valid cursor makes none
  assert.equal(encodeCursor("new", row(1, { source_updated_at: "not a time" })), null);
  assert.equal(encodeCursor("top", row(1, { slug: "bad slug" })), null);
});
