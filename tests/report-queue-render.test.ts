// @ts-nocheck -- loads a .tsx component through a CSS-module stub; the stub and the global React are test-only
import { test } from "node:test";
import assert from "node:assert/strict";

// Leaf 3.c.ix.zi. Written without being run, at the operator's request. Renders the real
// `components/ReportQueue.tsx` to static markup, the way tests/version-history-render.test.ts does:
// a `.module.css` import is stubbed, and React is a global because of the classic transform.
const req = (globalThis as any).require ?? require;
req.extensions[".css"] = (m: any) => {
  m.exports = { __esModule: true, default: new Proxy({}, { get: (_t, k) => String(k) }) };
};
const React = req("react");
(globalThis as any).React = React;
const { renderToStaticMarkup } = req("react-dom/server");
const mod = req("../components/ReportQueue");
const ReportQueue = mod.default;
const { formatAge } = mod;

const NOW = Date.parse("2026-10-02T12:00:00Z");
const report = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  app_slug: "whatsapp",
  application_id: null,
  reason: "Broken download link",
  status: "open",
  decision: null,
  decided_at: null,
  created_at: "2026-10-02T10:00:00+00:00",
  ...over,
});
const render = (over: Record<string, unknown>) =>
  renderToStaticMarkup(
    React.createElement(ReportQueue, {
      status: "open",
      result: { ok: true, reports: [], next_cursor: null },
      appNames: {},
      now: NOW,
      nextHref: null,
      switchHref: "/moderation/reports?status=closed",
      ...over,
    }),
  );

test("empty open list says so, and links to the closed list", () => {
  const html = render({});
  assert.match(html, /Open reports/);
  assert.match(html, /No open reports\./);
  assert.match(html, /href="\/moderation\/reports\?status=closed"[^>]*>Show closed reports</);
  assert.ok(!html.includes("<ul"));
});

test("rows: reason, app name and slug, age, and a link to the detail page", () => {
  const html = render({ result: { ok: true, reports: [report()], next_cursor: null }, appNames: { whatsapp: "WhatsApp" } });
  assert.match(html, /Broken download link/);
  assert.match(html, /WhatsApp \(whatsapp\)/);
  assert.match(html, /2 hours ago/);
  assert.match(html, /href="\/moderation\/reports\/11111111-1111-4111-8111-111111111111"/);
});

test("a slug the catalog did not resolve shows the bare slug", () => {
  const html = render({ result: { ok: true, reports: [report({ app_slug: "gone-app" })], next_cursor: null }, appNames: {} });
  assert.match(html, />gone-app</);
});

test("a legacy row (only application_id) gets a plain marker", () => {
  const html = render({ result: { ok: true, reports: [report({ app_slug: null, application_id: "legacy-7" })], next_cursor: null } });
  assert.match(html, /Legacy report \(no app slug\)/);
  assert.ok(!html.includes("legacy-7"), "the legacy application id is not shown");
});

test("details never appear, and store text is escaped, not rendered as HTML", () => {
  const html = render({
    result: { ok: true, reports: [{ ...report({ reason: "<img src=x onerror=alert(1)>" }), details: "SECRET DETAILS" }], next_cursor: null },
  });
  assert.ok(!html.includes("SECRET DETAILS"));
  assert.ok(!html.includes("<img"));
  assert.match(html, /&lt;img/);
});

test("a next page shows an Older reports link; none shows no link", () => {
  const withNext = render({ result: { ok: true, reports: [report()], next_cursor: { created_at: "x", id: "y" } }, nextHref: "/moderation/reports?status=open&cursor=abc" });
  assert.match(withNext, /href="\/moderation\/reports\?status=open&amp;cursor=abc"[^>]*>Older reports</);
  assert.ok(!render({ result: { ok: true, reports: [report()], next_cursor: null } }).includes("Older reports"));
});

test("closed list shows the decision and offers the open list", () => {
  const html = render({
    status: "closed",
    result: { ok: true, reports: [report({ status: "closed", decision: "remove", decided_at: "2026-10-02T11:00:00+00:00" })], next_cursor: null },
    switchHref: "/moderation/reports?status=open",
  });
  assert.match(html, /Closed reports/);
  assert.match(html, /decision: remove/);
  assert.match(html, /Show open reports/);
});

test("not_configured, unavailable and invalid_input render plain messages and no list", () => {
  for (const [reason, re] of [
    ["not_configured", /not configured/],
    ["unavailable", /could not be reached/],
    ["invalid_input", /could not be requested/],
  ]) {
    const html = render({ result: { ok: false, reason } });
    assert.match(html, re);
    assert.match(html, new RegExp(`data-state="${reason}"`));
    assert.ok(!html.includes("<ul"));
  }
});

test("formatAge: coarse units, singular and plural, future and unparseable", () => {
  assert.equal(formatAge("2026-10-02T11:59:30Z", NOW), "just now");
  assert.equal(formatAge("2026-10-02T11:59:00Z", NOW), "1 minute ago");
  assert.equal(formatAge("2026-10-02T11:00:00Z", NOW), "1 hour ago");
  assert.equal(formatAge("2026-09-29T12:00:00Z", NOW), "3 days ago");
  assert.equal(formatAge("2026-10-03T12:00:00Z", NOW), "just now");
  assert.equal(formatAge("nope", NOW), "unknown age");
});
