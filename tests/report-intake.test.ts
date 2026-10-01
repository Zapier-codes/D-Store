import assert from "node:assert/strict";
import test from "node:test";
import { handleReport, REPORT_MAX_BODY_BYTES, REPORT_MAX_DETAILS, type ReportIntakeDeps } from "../lib/report-intake";

const ENV = { SUPABASE_URL: "https://x.supabase.invalid", SUPABASE_SERVICE_ROLE_KEY: "svc-key" };
const ID = "00000000-0000-4000-8000-000000000001";

interface Call {
  url: string;
  init: RequestInit;
}

function setup(over: Partial<ReportIntakeDeps> & { insertStatus?: number; insertThrows?: boolean } = {}) {
  const calls: Call[] = [];
  const limiterCalls: { key: string; max: number; window: number; failOpen: boolean | undefined }[] = [];
  const deps: ReportIntakeDeps = {
    catalogHasSlug: over.catalogHasSlug ?? (async (s) => s === "whatsapp"),
    checkRateLimit:
      over.checkRateLimit ??
      (async (key, max, window, options) => {
        limiterCalls.push({ key, max, window, failOpen: options?.failOpen });
        return true;
      }),
    env: over.env ?? ENV,
    newId: () => ID,
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      if (over.insertThrows) throw new Error("boom");
      return new Response(null, { status: over.insertStatus ?? 201 });
    }) as typeof fetch,
  };
  return { deps, calls, limiterCalls };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://store.example/api/apps/whatsapp/reports", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const ok = { reason: "Broken download link", details: "  404 on the apk  " };

test("200: stores app_slug, no application_id, no IP; trims details", async () => {
  const { deps, calls } = setup();
  const res = await handleReport(post(ok), "whatsapp", deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://x.supabase.invalid/rest/v1/report_flag");
  assert.equal(calls[0].init.method, "POST");
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body, { id: ID, app_slug: "whatsapp", reason: "Broken download link", details: "404 on the apk", status: "open" });
  assert.ok(!("application_id" in body));
  assert.ok(!String(calls[0].init.body).includes("203.0.113.7"));
  const h = calls[0].init.headers as Record<string, string>;
  assert.equal(h.Prefer, "return=minimal");
  assert.equal(h.apikey, "svc-key");
});

test("200: no details stores null; blank details stores null", async () => {
  for (const d of [undefined, null, "   "]) {
    const { deps, calls } = setup();
    const res = await handleReport(post({ reason: "Other", details: d }), "whatsapp", deps);
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(String(calls[0].init.body)).details, null);
  }
});

test("200: details are capped at the maximum", async () => {
  const { deps, calls } = setup();
  await handleReport(post({ reason: "Other", details: "x".repeat(REPORT_MAX_DETAILS + 500) }), "whatsapp", deps);
  assert.equal(JSON.parse(String(calls[0].init.body)).details.length, REPORT_MAX_DETAILS);
});

test("never queries the application table", async () => {
  const { deps, calls } = setup();
  await handleReport(post(ok), "whatsapp", deps);
  assert.ok(calls.every((c) => !c.url.includes("/application")));
});

test("400: bad slug shape, before anything else", async () => {
  for (const s of ["", "a b", "a/b", "x".repeat(129), undefined, 5, "../etc"]) {
    const { deps, calls } = setup({ env: {} });
    const res = await handleReport(post(ok), s, deps);
    assert.equal(res.status, 400, String(s));
    assert.equal(calls.length, 0);
  }
});

test("503: Supabase not configured, nothing stored, limiter not asked", async () => {
  for (const env of [{}, { SUPABASE_URL: "https://x" }, { SUPABASE_SERVICE_ROLE_KEY: "k" }]) {
    const { deps, calls, limiterCalls } = setup({ env });
    const res = await handleReport(post(ok), "whatsapp", deps);
    assert.equal(res.status, 503);
    assert.equal(calls.length, 0);
    assert.equal(limiterCalls.length, 0);
  }
});

test("429: throttled; limiter is fail-closed, 5 per hour, bucket carries no slug", async () => {
  const { deps, calls, limiterCalls } = setup();
  const throttled = setup({ checkRateLimit: async () => false });
  const res = await handleReport(post(ok), "whatsapp", throttled.deps);
  assert.equal(res.status, 429);
  assert.equal(throttled.calls.length, 0);
  await handleReport(post(ok), "whatsapp", deps);
  assert.equal(limiterCalls[0].max, 5);
  assert.equal(limiterCalls[0].window, 3600);
  assert.equal(limiterCalls[0].failOpen, false);
  assert.match(limiterCalls[0].key, /^report:[0-9a-f]{32}$/);
  assert.ok(!limiterCalls[0].key.includes("whatsapp"));
  assert.equal(calls.length, 1);
});

test("429 comes before the body is read and before the catalog is asked", async () => {
  let asked = false;
  const { deps } = setup({ checkRateLimit: async () => false, catalogHasSlug: async () => ((asked = true), true) });
  const res = await handleReport(post("not json"), "whatsapp", deps);
  assert.equal(res.status, 429);
  assert.equal(asked, false);
});

test("413: body over the cap", async () => {
  const { deps, calls } = setup();
  const res = await handleReport(post("x".repeat(REPORT_MAX_BODY_BYTES + 1)), "whatsapp", deps);
  assert.equal(res.status, 413);
  assert.equal(calls.length, 0);
});

test("400: invalid JSON, non-object, bad reason, bad details", async () => {
  const cases: unknown[] = ["{nope", "[]", "null", "5", { reason: "Spam" }, {}, { reason: 3 }, { reason: "Other", details: 7 }];
  for (const c of cases) {
    const { deps, calls } = setup();
    const res = await handleReport(post(c), "whatsapp", deps);
    assert.equal(res.status, 400, JSON.stringify(c));
    assert.equal(calls.length, 0);
  }
});

test("404: slug not in the catalog; nothing stored", async () => {
  const { deps, calls } = setup();
  const res = await handleReport(post(ok), "no-such-app", deps);
  assert.equal(res.status, 404);
  assert.equal(calls.length, 0);
});

test("the catalog is asked about the slug from the path", async () => {
  const seen: string[] = [];
  const { deps } = setup({ catalogHasSlug: async (s) => (seen.push(s), true) });
  await handleReport(post(ok), "org.example.app", deps);
  assert.deepEqual(seen, ["org.example.app"]);
});

test("502: catalog unreadable is not a 404, and nothing is stored", async () => {
  const { deps, calls } = setup({
    catalogHasSlug: async () => {
      throw new Error("index down");
    },
  });
  const res = await handleReport(post(ok), "whatsapp", deps);
  assert.equal(res.status, 502);
  assert.equal(calls.length, 0);
});

test("502: Supabase insert refused or throwing; error text leaks nothing", async () => {
  for (const o of [{ insertStatus: 500 }, { insertStatus: 409 }, { insertThrows: true }]) {
    const { deps } = setup(o);
    const res = await handleReport(post(ok), "whatsapp", deps);
    assert.equal(res.status, 502);
    const text = JSON.stringify(await res.json());
    assert.ok(!text.includes("svc-key") && !text.includes("supabase"));
  }
});
