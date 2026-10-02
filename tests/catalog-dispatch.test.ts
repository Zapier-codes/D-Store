import assert from "node:assert/strict";
import test from "node:test";
import { DISPATCH_CHUNK, DISPATCH_SLUGS_MAX, buildDispatchQuery, readCatalogDispatchApps } from "../lib/catalog-dispatch";

// Leaf 5.l.xv.zo. Written, NOT run (standing operator instruction, 2026-10-02: no testing). Covers the
// TypeScript side against a fake fetch; nothing here talks to a real PostgREST.

const ENV = { SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "service-key-123" };

function row(slug: string) {
  return { slug, package_name: `com.${slug}`, name: slug.toUpperCase(), version: "1.0" };
}

function fakeFetch(answer: (url: string) => unknown, seen: string[] = [], status = 200) {
  return (async (url: string) => {
    seen.push(url);
    const body = answer(url);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

test("buildDispatchQuery quotes and encodes the slug list, and refuses bad input", () => {
  const q = buildDispatchQuery(["a", 'b"c']);
  assert.ok(q !== null && q.includes("is_published=eq.true") && q.includes("limit=2"));
  assert.ok(!q!.includes('"')); // encoded
  assert.equal(buildDispatchQuery([]), null);
  assert.equal(buildDispatchQuery(["a", ""]), null);
  assert.equal(buildDispatchQuery(Array.from({ length: DISPATCH_CHUNK + 1 }, (_, i) => `a${i}`)), null);
});

test("not configured makes no request", async () => {
  const seen: string[] = [];
  const result = await readCatalogDispatchApps(["a"], { env: {}, fetch: fakeFetch(() => [], seen) });
  assert.deepEqual(result, { ok: false, reason: "not_configured" });
  assert.equal(seen.length, 0);
});

test("no usable slug is an empty answer without a request", async () => {
  const seen: string[] = [];
  const result = await readCatalogDispatchApps(["", "Not A Slug!"], { env: ENV, fetch: fakeFetch(() => [], seen) });
  assert.deepEqual(result, { ok: true, rows: [] });
  assert.equal(seen.length, 0);
});

test("reads the asked slugs, a missing one is simply absent", async () => {
  const seen: string[] = [];
  const result = await readCatalogDispatchApps(["alpha", "beta", "alpha"], {
    env: ENV,
    fetch: fakeFetch(() => [row("alpha")], seen),
  });
  assert.equal(seen.length, 1);
  assert.deepEqual(result, { ok: true, rows: [row("alpha")] });
});

test("more slugs than one chunk are read in several requests", async () => {
  const slugs = Array.from({ length: DISPATCH_CHUNK + 5 }, (_, i) => `app-${i}`);
  const seen: string[] = [];
  const result = await readCatalogDispatchApps(slugs, { env: ENV, fetch: fakeFetch(() => [], seen) });
  assert.equal(seen.length, 2);
  assert.deepEqual(result, { ok: true, rows: [] });
});

test("more than the cap is refused", async () => {
  const slugs = Array.from({ length: DISPATCH_SLUGS_MAX + 1 }, (_, i) => `app-${i}`);
  const result = await readCatalogDispatchApps(slugs, { env: ENV, fetch: fakeFetch(() => []) });
  assert.deepEqual(result, { ok: false, reason: "unavailable" });
});

test("a bad answer refuses the whole read", async () => {
  const cases: unknown[] = [
    "not json",
    { not: "an array" },
    [row("alpha"), row("beta")], // more rows than asked for (one slug asked)
    [row("other")], // a slug that was not asked for
    [{ slug: "alpha", package_name: "x", name: 1, version: "1" }], // malformed row
  ];
  for (const body of cases) {
    const result = await readCatalogDispatchApps(["alpha"], { env: ENV, fetch: fakeFetch(() => body) });
    assert.deepEqual(result, { ok: false, reason: "unavailable" });
  }
  const dup = await readCatalogDispatchApps(["alpha", "beta"], { env: ENV, fetch: fakeFetch(() => [row("alpha"), row("alpha")]) });
  assert.deepEqual(dup, { ok: false, reason: "unavailable" });
});

test("a non-2xx or a thrown fetch is unavailable", async () => {
  const bad = await readCatalogDispatchApps(["alpha"], { env: ENV, fetch: fakeFetch(() => [], [], 500) });
  assert.deepEqual(bad, { ok: false, reason: "unavailable" });
  const threw = await readCatalogDispatchApps(["alpha"], {
    env: ENV,
    fetch: (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch,
  });
  assert.deepEqual(threw, { ok: false, reason: "unavailable" });
});
