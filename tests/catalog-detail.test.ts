import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { appFromCatalogDetail, readCatalogApp, readCatalogDeveloper, readCatalogSlugExists } from "../lib/catalog-detail";
import { CATALOG_MAX_BODY_BYTES, type CatalogRow } from "../lib/catalog-table";
import { normalizeAptoideApp } from "../lib/sources/aptoide";

// Leaf 5.l.vi.zi. Written, NOT run (standing operator instruction, 2026-10-02: no testing). These cover
// the TypeScript side against a fake fetch and the first committed Aptoide fixture; nothing here
// talks to a real PostgREST.

const ENV = { SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "service-key-123" };
const fixture: any[] = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "aptoide-snapshot-12.json"), "utf8"));
const raw = fixture[0];
const normalized = normalizeAptoideApp(structuredClone(raw));

function rowFor(over: Partial<CatalogRow> = {}): CatalogRow {
  return {
    id: normalized.id,
    slug: normalized.slug,
    package_name: normalized.package_name as string,
    origin: "aptoide",
    name: normalized.name,
    summary: normalized.summary,
    icon: normalized.icon,
    version: normalized.version,
    app_type: normalized.app_type,
    category: normalized.category,
    developer_slug: normalized.developer_slug,
    developer_name: normalized.developer_name as string,
    license: normalized.license,
    size_mb: normalized.size_mb,
    download_url: normalized.apk,
    reported_downloads: 1234,
    source_created_at: "2026-01-01T00:00:00+00:00",
    source_updated_at: "2026-09-10T12:00:00+00:00",
    ...over,
  };
}

function fakeFetch(body: unknown, seen: any[] = [], status = 200) {
  return (async (url: string, init: any) => {
    seen.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

test("readCatalogApp asks for one published row by slug, with raw, using the service key", async () => {
  const seen: any[] = [];
  const out = await readCatalogApp(normalized.slug, { env: ENV, fetch: fakeFetch([{ ...rowFor(), raw }], seen) });
  assert.equal(out.ok, true);
  assert.equal(seen.length, 1);
  const url = String(seen[0].url);
  assert.ok(url.startsWith("https://proj.supabase.co/rest/v1/catalog_app?"));
  assert.ok(url.includes(`slug=eq.${encodeURIComponent(normalized.slug)}`));
  assert.ok(url.includes("is_published=eq.true"));
  assert.ok(url.includes(",raw&limit=1"));
  assert.equal(seen[0].init.method, "GET");
  assert.equal(seen[0].init.headers.apikey, "service-key-123");
  assert.equal(seen[0].init.redirect, "error");
});

test("the app carries what raw holds, not the list-grade placeholders", async () => {
  const out = await readCatalogApp(normalized.slug, { env: ENV, fetch: fakeFetch([{ ...rowFor(), raw }]) });
  assert.ok(out.ok && out.app);
  assert.equal(out.app.description, normalized.description);
  assert.deepEqual(out.app.screenshots, normalized.screenshots);
  assert.equal(out.app.changelog, normalized.changelog);
  assert.deepEqual(out.app.not_provided, normalized.not_provided);
});

test("the columns win for category, app_type, id, slug and dates", () => {
  const app = appFromCatalogDetail(
    rowFor({ category: "weather", app_type: "game", source_updated_at: "2026-09-30T00:00:00+00:00" }),
    raw,
  );
  assert.equal(app.category, "weather");
  assert.equal(app.app_type, "game");
  assert.equal(app.updated_at, "2026-09-30T00:00:00+00:00");
  assert.equal(app.slug, normalized.slug);
  // the payload's own placement note does not describe a category the columns moved to
  if (normalized.category !== "weather") assert.equal(app.category_raw, undefined);
});

test("a raw that cannot be normalised gives the list-grade app, not an error", () => {
  for (const bad of [null, undefined, "x", [], {}]) {
    const app = appFromCatalogDetail(rowFor(), bad);
    assert.equal(app.slug, normalized.slug);
    assert.equal(app.changelog, "No changelog provided.");
  }
});

test("no row is an app of null; a slug the table cannot hold makes no request", async () => {
  assert.deepEqual(await readCatalogApp("nope", { env: ENV, fetch: fakeFetch([]) }), { ok: true, app: null });
  const seen: any[] = [];
  for (const slug of ["", "../x", "a b", "-lead", "a".repeat(201), "a&slug=eq.b"]) {
    assert.deepEqual(await readCatalogApp(slug, { env: ENV, fetch: fakeFetch([], seen) }), { ok: true, app: null });
  }
  assert.equal(seen.length, 0);
});

test("unusable env makes no request; failures are unavailable, never 'not found'", async () => {
  const seen: any[] = [];
  assert.deepEqual(await readCatalogApp("ok", { env: {}, fetch: fakeFetch([], seen) }), { ok: false, reason: "not_configured" });
  assert.equal(seen.length, 0);

  const unavailable = { ok: false, reason: "unavailable" };
  assert.deepEqual(await readCatalogApp("ok", { env: ENV, fetch: fakeFetch("{}", [], 500) }), unavailable);
  assert.deepEqual(await readCatalogApp("ok", { env: ENV, fetch: fakeFetch("not json") }), unavailable);
  assert.deepEqual(await readCatalogApp("ok", { env: ENV, fetch: fakeFetch({ a: 1 }) }), unavailable);
  assert.deepEqual(await readCatalogApp("ok", { env: ENV, fetch: fakeFetch([{ ...rowFor(), raw }, { ...rowFor(), raw }]) }), unavailable);
  assert.deepEqual(await readCatalogApp("ok", { env: ENV, fetch: fakeFetch([{ slug: "ok" }]) }), unavailable);
  // an answer for a different slug than the one asked for is not trusted
  assert.deepEqual(await readCatalogApp("other", { env: ENV, fetch: fakeFetch([{ ...rowFor(), raw }]) }), unavailable);
  assert.deepEqual(await readCatalogApp("ok", { env: ENV, fetch: fakeFetch("[" + " ".repeat(CATALOG_MAX_BODY_BYTES) + "]") }), unavailable);
  const throwing = (async () => { throw new Error("secret https://proj.supabase.co/key"); }) as unknown as typeof fetch;
  assert.deepEqual(await readCatalogApp("ok", { env: ENV, fetch: throwing }), unavailable);
});

test("readCatalogSlugExists returns the package name, and no raw is requested", async () => {
  const seen: any[] = [];
  const out = await readCatalogSlugExists("some-app", {
    env: ENV,
    fetch: fakeFetch([{ slug: "some-app", package_name: "com.some.app" }], seen),
  });
  assert.deepEqual(out, { ok: true, found: { package_name: "com.some.app" } });
  const url = String(seen[0].url);
  assert.ok(url.includes("select=slug,package_name"));
  assert.ok(!url.includes("raw"));
  assert.deepEqual(await readCatalogSlugExists("some-app", { env: ENV, fetch: fakeFetch([]) }), { ok: true, found: null });
  assert.deepEqual(await readCatalogSlugExists("some-app", { env: ENV, fetch: fakeFetch([{ slug: "x", package_name: "p" }]) }), {
    ok: false,
    reason: "unavailable",
  });
});

test("readCatalogDeveloper reads name and website, and keeps only an http(s) website", async () => {
  const seen: any[] = [];
  const ok = await readCatalogDeveloper("acme-ltd", {
    env: ENV,
    fetch: fakeFetch([{ developer_slug: "acme-ltd", developer_name: "Acme Ltd", website: "https://acme.test" }], seen),
  });
  assert.deepEqual(ok, { ok: true, developer: { slug: "acme-ltd", name: "Acme Ltd", website: "https://acme.test" } });
  assert.ok(String(seen[0].url).includes("developer_slug=eq.acme-ltd"));
  assert.ok(!String(seen[0].url).includes("select=raw"));

  for (const website of ["javascript:alert(1)", "ftp://x", null]) {
    const out = await readCatalogDeveloper("acme-ltd", {
      env: ENV,
      fetch: fakeFetch([{ developer_slug: "acme-ltd", developer_name: "Acme Ltd", website }]),
    });
    assert.ok(out.ok && out.developer);
    assert.equal(out.developer.website, null);
  }
  assert.deepEqual(await readCatalogDeveloper("nobody", { env: ENV, fetch: fakeFetch([]) }), { ok: true, developer: null });
  assert.deepEqual(await readCatalogDeveloper("", { env: ENV, fetch: fakeFetch([]) }), { ok: true, developer: null });
});
