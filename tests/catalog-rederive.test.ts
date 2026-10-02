import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeAptoideApp, placeAptoideApp, type AptoideRawApp } from "../lib/sources/aptoide";
import { planRederive, rederiveCatalogCategories, tallyPlacements, type StoredRow } from "../lib/catalog-rederive";

// Leaf 5.l.viii.zo. Written, NOT run (standing instruction: no tests or builds).

const fixture: AptoideRawApp[] = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/aptoide-snapshot-12.json"), "utf8"));
const base = fixture[0];

/** A raw app for a package outside the curated table, with the given keywords. */
function raw(pkg: string, keywords: unknown, id = 900001): AptoideRawApp {
  return { ...base, id, package: pkg, uname: `app-${id}`, media: { ...base.media, keywords } };
}

test("a curated package keeps its table shelf even when its keywords say something else", () => {
  const placement = placeAptoideApp({ ...base, package: "com.waze", media: { ...base.media, keywords: ["photography"] } });
  assert.equal(placement.via, "package");
  assert.deepEqual([placement.app_type, placement.category], ["app", "maps-and-navigation"]);
});

test("an unmapped package is placed by its keywords", () => {
  const placement = placeAptoideApp(raw("com.example.cam", ["android", "photography"]));
  assert.deepEqual(placement, { app_type: "app", category: "photography", category_raw: null, via: "keywords" });
});

test("a keyword game genre makes a game; an ambiguous word alone does not", () => {
  assert.deepEqual(
    [placeAptoideApp(raw("com.example.p", ["puzzle"])).app_type, placeAptoideApp(raw("com.example.p", ["puzzle"])).category],
    ["game", "puzzle"],
  );
  const noGenre = placeAptoideApp(raw("com.example.a", ["action"]));
  assert.equal(noGenre.app_type, "app");
  assert.equal(noGenre.category, "uncategorized");
});

test("no usable keywords, or keywords that are not a list, stay uncategorized and never throw", () => {
  for (const keywords of [undefined, null, "tools", 7, {}, [], [1, null, {}], ["__proto__", "constructor"]]) {
    const placement = placeAptoideApp(raw("com.example.none", keywords));
    assert.deepEqual([placement.app_type, placement.category, placement.via], ["app", "uncategorized", "none"]);
  }
  assert.doesNotThrow(() => placeAptoideApp({ ...base, package: "com.example.nomedia", media: undefined } as unknown as AptoideRawApp));
});

test("normalizeAptoideApp uses the placement: category and app_type follow the keywords", () => {
  const app = normalizeAptoideApp(raw("com.example.cam", ["photography"]));
  assert.equal(app.category, "photography");
  assert.equal(app.app_type, "app");
  assert.equal(app.category_raw, undefined);
  const none = normalizeAptoideApp(raw("com.example.none", ["android"]));
  assert.equal(none.category, "uncategorized");
});

test("the 12 curated fixture apps are unchanged: every one is placed by the package table", () => {
  for (const app of fixture) assert.equal(placeAptoideApp(app).via, "package", app.package);
});

const stored = (id: string, appType: string, category: string, rawApp: unknown): StoredRow => ({ id, app_type: appType, category, raw: rawApp });

test("planRederive keeps only rows whose answer differs, and counts shelves before and after", () => {
  const plan = planRederive([
    stored("aptoide-1", "app", "uncategorized", raw("com.example.cam", ["photography"], 1)), // changes
    stored("aptoide-2", "app", "uncategorized", raw("com.example.none", ["android"], 2)), // already right
    stored("aptoide-3", "app", "photography", raw("com.example.cam2", ["photography"], 3)), // already right
    stored("aptoide-4", "app", "uncategorized", raw("com.example.p", ["puzzle"], 4)), // app -> game
    stored("aptoide 5", "app", "uncategorized", raw("com.example.cam", ["photography"], 5)), // unsafe id, left alone
  ]);
  assert.deepEqual(plan.changes, [
    { id: "aptoide-1", app_type: "app", category: "photography" },
    { id: "aptoide-4", app_type: "game", category: "puzzle" },
  ]);
  assert.equal(plan.unchanged, 2);
  assert.equal(plan.unreadable, 1);
  assert.equal(plan.changedByKeywords, 2);
  assert.deepEqual(plan.before, { "app/uncategorized": 4, "app/photography": 1 });
  assert.deepEqual(plan.after, { "app/photography": 2, "app/uncategorized": 2, "game/puzzle": 1 });
});

test("planRederive never throws on rows with a missing or non-object raw", () => {
  const plan = planRederive([stored("aptoide-9", "app", "uncategorized", null), stored("aptoide-10", "app", "uncategorized", "text")]);
  assert.equal(plan.changes.length, 0);
});

test("tallyPlacements counts shelves with no table", () => {
  const tally = tallyPlacements([raw("com.example.cam", ["photography"], 1), raw("com.example.none", [], 2), base]);
  assert.equal(tally.total, 3);
  assert.equal(tally.byKeywords, 1);
  assert.equal(tally.byShelf["app/photography"], 1);
  assert.equal(tally.byShelf["app/uncategorized"], 1);
});

// --- the table reader and writer, against a fake fetch ---------------------------------------------

const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-key" };

interface Call {
  method: string;
  url: string;
  body?: string;
}

function fakeTable(rows: StoredRow[], opts: { failReadAt?: number; failWrite?: boolean } = {}) {
  const calls: Call[] = [];
  let reads = 0;
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: typeof init?.body === "string" ? init.body : undefined });
    if (method === "GET") {
      reads += 1;
      if (opts.failReadAt === reads) return new Response("nope", { status: 500 });
      const u = new URL(url);
      const limit = Number(u.searchParams.get("limit"));
      const gt = u.searchParams.get("id")?.replace(/^gt\./, "") ?? null;
      const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
      const page = sorted.filter((r) => gt === null || r.id > gt).slice(0, limit);
      return new Response(JSON.stringify(page), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(null, { status: opts.failWrite ? 500 : 204 });
  }) as typeof fetch;
  return { fetchFn, calls };
}

const threeRows = (): StoredRow[] => [
  stored("aptoide-1", "app", "uncategorized", raw("com.example.cam", ["photography"], 1)),
  stored("aptoide-2", "app", "uncategorized", raw("com.example.cam2", ["photography"], 2)),
  stored("aptoide-3", "app", "uncategorized", raw("com.example.none", ["android"], 3)),
];

test("a dry run reads every page and writes nothing", async () => {
  const { fetchFn, calls } = fakeTable(threeRows());
  const result = await rederiveCatalogCategories({ dryRun: true }, { env, fetch: fetchFn, pageSize: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.report.scanned, 3);
  assert.equal(result.report.changes.length, 2);
  assert.equal(result.report.patched, 0);
  assert.equal(calls.filter((c) => c.method !== "GET").length, 0);
  assert.equal(calls.filter((c) => c.method === "GET").length, 2); // a page of 2, then a short page of 1
  assert.ok(calls[1].url.includes("id=gt.aptoide-2"));
  assert.ok(calls.every((c) => c.url.includes("origin=eq.aptoide")));
});

test("a real run sends one PATCH per distinct shelf, with only the two columns", async () => {
  const { fetchFn, calls } = fakeTable(threeRows());
  const result = await rederiveCatalogCategories({ dryRun: false }, { env, fetch: fetchFn, pageSize: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.report.patched, 2);
  const patches = calls.filter((c) => c.method === "PATCH");
  assert.equal(patches.length, 1);
  assert.ok(patches[0].url.includes("id=in.(aptoide-1,aptoide-2)"));
  assert.deepEqual(JSON.parse(patches[0].body ?? "{}"), { app_type: "app", category: "photography" });
});

test("an unconfigured environment refuses before any request", async () => {
  const { fetchFn, calls } = fakeTable(threeRows());
  const result = await rederiveCatalogCategories({ dryRun: false }, { env: {}, fetch: fetchFn });
  assert.deepEqual([result.ok, result.ok ? null : result.reason], [false, "not_configured"]);
  assert.equal(calls.length, 0);
});

test("a failed read stops before any write", async () => {
  const { fetchFn, calls } = fakeTable(threeRows(), { failReadAt: 2 });
  const result = await rederiveCatalogCategories({ dryRun: false }, { env, fetch: fetchFn, pageSize: 2 });
  assert.deepEqual([result.ok, result.ok ? null : result.reason], [false, "read_failed"]);
  assert.equal(calls.filter((c) => c.method === "PATCH").length, 0);
});

test("a refused write reports write_failed with nothing counted as patched", async () => {
  const { fetchFn } = fakeTable(threeRows(), { failWrite: true });
  const result = await rederiveCatalogCategories({ dryRun: false }, { env, fetch: fetchFn });
  assert.deepEqual([result.ok, result.ok ? null : result.reason], [false, "write_failed"]);
  assert.equal(result.report.patched, 0);
});
