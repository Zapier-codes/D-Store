/**
 * End-to-end smoke test — leaf `5.d.iv.zo`.
 *
 * Drives a RUNNING D-Store over HTTP and checks that browse, download and
 * rate still work. It does not start the server: build and start it first,
 * then run this from the repo root.
 *
 *   npm run build && npx next start -p 3000 &
 *   npm run smoke                       # or: SMOKE_BASE_URL=http://localhost:4000 npm run smoke
 *
 * Needs nothing but localhost: the catalog comes from the committed snapshots
 * (`storage/downloads`), so no Supabase project, no Console and no Aptoide
 * connection are involved. Exits 0 when every check passes, 1 on the first
 * failure (with the check's name and what was seen), 2 when the server never
 * answered.
 *
 * WHAT IT CHANGES: the install and review routes write to the running
 * server's in-memory dummy data (a counter goes up by one, a rating moves).
 * Restart the server afterwards if that matters. It only ever writes to a
 * FIRST-PARTY app: a write to a third-party app would bump the store-native
 * counters that must stay 0 for those apps.
 *
 * WHAT IT DOES NOT COVER: the download itself (a browser-side anchor click on
 * the Console's release URL — the smoke test only checks the install-counter
 * route and that a detail page renders), the admin pages, the push routes,
 * search, the service worker, anything visual, and anything that needs a live
 * Supabase project.
 */

// A module, not a global script: several scripts here define `main`.
export {};


const BASE = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const READY_TIMEOUT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 30_000;

let passed = 0;

class SmokeFailure extends Error {}

function fail(name: string, detail: string): never {
  throw new SmokeFailure(`FAIL  ${name}\n      ${detail}`);
}

function pass(name: string): void {
  passed++;
  console.log(`ok    ${name}`);
}

async function request(path: string, init?: RequestInit): Promise<{ status: number; text: string }> {
  const response = await fetch(`${BASE}${path}`, { ...init, redirect: "manual", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  return { status: response.status, text: await response.text() };
}

async function waitUntilReady(): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const { status } = await request("/");
      if (status > 0) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function page(name: string, path: string, mustContain: string[] = [], mustNotContain: string[] = []): Promise<string> {
  const { status, text } = await request(path);
  if (status !== 200) fail(name, `GET ${path} answered ${status}, expected 200`);
  for (const needle of mustContain) if (!text.includes(needle)) fail(name, `GET ${path} does not contain ${JSON.stringify(needle)}`);
  for (const needle of mustNotContain) if (text.includes(needle)) fail(name, `GET ${path} contains ${JSON.stringify(needle)}, which it must not`);
  pass(name);
  return text;
}

async function postJson(path: string, body?: string): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const { status, text } = await request(path, {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body,
  });
  try {
    const parsed: unknown = JSON.parse(text);
    return { status, json: typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null };
  } catch {
    return { status, json: null };
  }
}

function expectStatus(name: string, actual: number, expected: number, path: string): void {
  if (actual !== expected) fail(name, `POST ${path} answered ${actual}, expected ${expected}`);
}

async function main(): Promise<void> {
  console.log(`Smoke test against ${BASE}`);
  if (!(await waitUntilReady())) {
    console.error(`No answer from ${BASE} after ${READY_TIMEOUT_MS / 1000}s. Start the server first (npm run build && npx next start).`);
    process.exit(2);
  }

  // --- Browse -------------------------------------------------------------
  await page("browse: home page", "/", ["<html"]);
  await page("browse: categories index", "/categories");
  let sitemap = await page("browse: sitemap", "/sitemap.xml");
  if (sitemap.includes("<sitemapindex")) {
    // Table mode (5.l.vi.zo): /sitemap.xml is an index; the first chunk holds the first-party apps.
    const firstChunk = /<loc>https?:\/\/[^<]*?(\/sitemap-chunks\/0\.xml)<\/loc>/.exec(sitemap);
    if (!firstChunk) fail("browse: sitemap index lists chunk 0", "no /sitemap-chunks/0.xml entry in the index");
    sitemap = await page("browse: sitemap chunk 0", firstChunk![1], ["<urlset"]);
  } else if (!sitemap.includes("<urlset")) {
    fail("browse: sitemap", "GET /sitemap.xml is neither a <urlset> nor a <sitemapindex>");
  }

  const slugs = [...new Set([...sitemap.matchAll(/\/app\/([a-z0-9]+(?:-[a-z0-9]+)*)<\/loc>/g)].map((m) => m[1]))];
  if (slugs.length === 0) fail("browse: sitemap lists apps", "no /app/<slug> entries found in the sitemap");
  pass(`browse: sitemap lists ${slugs.length} apps`);

  // Classify by what each detail page says about itself.
  const firstPartySlugs: string[] = [];
  let thirdParty: string | null = null;
  const pages = new Map<string, string>();
  for (const slug of slugs) {
    const { status, text } = await request(`/app/${slug}`);
    if (status !== 200) fail("browse: every listed app page renders", `GET /app/${slug} answered ${status}, expected 200`);
    pages.set(slug, text);
    if (text.includes("Third-party (via Aptoide)")) thirdParty ??= slug;
    else firstPartySlugs.push(slug);
  }
  pass("browse: every listed app page renders");
  const firstParty = firstPartySlugs[0];
  if (firstParty === undefined) fail("browse: a first-party app exists", "every listed app is third-party");
  if (thirdParty === null) fail("browse: a third-party app exists", "no listed app carries the third-party label; is the Aptoide snapshot deployed?");
  pass(`browse: first-party app is ${firstParty}, third-party app is ${thirdParty}`);

  const thirdPartyHtml = pages.get(thirdParty) as string;
  if (thirdPartyHtml.includes("0+ installs")) fail("browse: third-party page shows no store-native install count", "found \"0+ installs\"");
  if (!thirdPartyHtml.includes("Aptoide")) fail("browse: third-party page names its source", "no mention of Aptoide");
  pass("browse: third-party page shows its own source figures, not store-native ones");

  const topFree = await page("browse: Top Free chart", "/charts/top-free", ["Top Free", "Third-party apps"]);
  if (!topFree.includes(`/app/${firstParty}`) || !topFree.includes(`/app/${thirdParty}`)) {
    fail("browse: Top Free lists both groups", "the first-party and third-party sample apps are not both linked");
  }
  pass("browse: Top Free lists both groups");

  await page("browse: New & Updated chart", "/charts/new");

  // --- Download (install counter) ----------------------------------------
  // The install and review routes look an app up in `lib/mock-data.ts`'s `apps` array only (see the
  // NOTE above `incrementInstallCount` in lib/catalog.ts), while the listed catalog comes from the
  // Console's index, so a listed first-party slug can answer 404. Try each until one is accepted;
  // if none is, that mismatch is the finding, and the test fails saying so.
  let writable: string | null = null;
  let first: { status: number; json: Record<string, unknown> | null } = { status: 0, json: null };
  const tried: string[] = [];
  for (const slug of firstPartySlugs) {
    first = await postJson(`/api/apps/${slug}/install`);
    tried.push(`${slug}:${first.status}`);
    if (first.status === 200) {
      writable = slug;
      break;
    }
  }
  if (writable === null) {
    fail(
      "download: install count on a first-party app",
      `no listed first-party app accepted POST /api/apps/<slug>/install (${tried.join(", ")}); the mutators only see the mock apps array, not the merged catalog`,
    );
  }
  const before = first.json?.install_count;
  if (typeof before !== "number") fail("download: install count on a first-party app", `response has no numeric install_count: ${JSON.stringify(first.json)}`);
  pass(`download: install count on a first-party app (${writable})`);
  const second = await postJson(`/api/apps/${writable}/install`);
  if (second.json?.install_count !== before + 1) {
    fail("download: install count goes up by one per call", `first ${before}, second ${JSON.stringify(second.json?.install_count)}`);
  }
  pass("download: install count goes up by one per call");

  const missingInstall = await postJson("/api/apps/no-such-app-smoke/install");
  expectStatus("download: unknown app is 404", missingInstall.status, 404, "/api/apps/no-such-app-smoke/install");
  pass("download: unknown app is 404");

  // --- Rate ---------------------------------------------------------------
  const ratePath = `/api/apps/${writable}/reviews`;
  const rated = await postJson(ratePath, JSON.stringify({ stars: 5 }));
  expectStatus("rate: a 5-star rating is accepted", rated.status, 200, ratePath);
  if (typeof rated.json?.avg_rating !== "number" || typeof rated.json?.rating_count !== "number") {
    fail("rate: a 5-star rating is accepted", `response lacks numeric avg_rating and rating_count: ${JSON.stringify(rated.json)}`);
  }
  pass("rate: a 5-star rating is accepted and returns the new average and count");

  for (const bad of [0, 6, 2.5, "5", null]) {
    const result = await postJson(ratePath, JSON.stringify({ stars: bad }));
    expectStatus(`rate: stars ${JSON.stringify(bad)} is refused`, result.status, 400, ratePath);
  }
  const notJson = await postJson(ratePath, "not json");
  expectStatus("rate: a body that is not JSON is refused", notJson.status, 400, ratePath);
  pass("rate: bad stars and a bad body are refused with 400");

  const missingRate = await postJson("/api/apps/no-such-app-smoke/reviews", JSON.stringify({ stars: 5 }));
  expectStatus("rate: unknown app is 404", missingRate.status, 404, "/api/apps/no-such-app-smoke/reviews");
  pass("rate: unknown app is 404");

  console.log(`\n${passed} checks passed.`);
}

main().catch((error: unknown) => {
  if (error instanceof SmokeFailure) {
    console.error(`\n${error.message}\n\n${passed} checks passed before this one.`);
  } else {
    console.error("\nSmoke test crashed:", error);
  }
  process.exit(1);
});
