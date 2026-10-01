// @ts-nocheck -- loads .tsx components through a CSS-module stub; the stub and the global React are test-only
import { test } from "node:test";
import assert from "node:assert/strict";

// Leaf 3.c.ix.zo. Written without being run, at the operator's request. Same harness as
// tests/report-queue-render.test.ts: `.module.css` imports are stubbed and React is a global.
const req = (globalThis as any).require ?? require;
req.extensions[".css"] = (m: any) => {
  m.exports = { __esModule: true, default: new Proxy({}, { get: (_t, k) => String(k) }) };
};
const React = req("react");
(globalThis as any).React = React;
const { renderToStaticMarkup } = req("react-dom/server");
const ReportDetail = req("../components/ReportDetail").default;
const { describeDecisionStatus, DECISION_OPTIONS } = req("../components/ReportDecisionForm");

const report = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  app_slug: "whatsapp",
  application_id: null,
  reason: "Broken download link",
  status: "open",
  decision: null,
  decided_at: null,
  created_at: "2026-10-02T10:00:00+00:00",
  details: "The link gives a 404.",
  ...over,
});
const render = (result: unknown, appName: string | null = "WhatsApp") =>
  renderToStaticMarkup(React.createElement(ReportDetail, { result, appName, backHref: "/moderation/reports" }));

test("open report: facts, details as text, and the decision form with all four decisions", () => {
  const html = render({ ok: true, report: report() });
  assert.match(html, /Broken download link/);
  assert.match(html, /WhatsApp \(whatsapp\)/);
  assert.match(html, /The link gives a 404\./);
  assert.match(html, /href="\/moderation\/reports"[^>]*>Back to the queue</);
  assert.match(html, /<form/);
  for (const v of ["no_action", "relabel", "remove", "escalate"]) assert.match(html, new RegExp(`value="${v}"`));
  assert.match(html, /<button[^>]*disabled=""[^>]*>Close report</); // nothing chosen yet
});

test("closed report: decision and time, and no form", () => {
  const html = render({
    ok: true,
    report: report({ status: "closed", decision: "remove", decided_at: "2026-10-02T11:00:00+00:00" }),
  });
  assert.match(html, /Closed with the decision: remove\./);
  assert.match(html, /Decided at 2026-10-02T11:00:00\+00:00\./);
  assert.ok(!html.includes("<form"));
  assert.ok(!html.includes('type="radio"'));
});

test("a legacy closed row with no decision says so and shows no form", () => {
  const html = render({ ok: true, report: report({ status: "resolved", app_slug: null, application_id: "7" }) }, null);
  assert.match(html, /Legacy report \(no app slug\)/);
  assert.match(html, /Closed \(no decision recorded\)\./);
  assert.ok(!html.includes("<form"));
});

test("an unresolved slug shows the bare slug", () => {
  const html = render({ ok: true, report: report() }, null);
  assert.match(html, /<dd>whatsapp<\/dd>/);
});

test("no details: says so", () => {
  const html = render({ ok: true, report: report({ details: null }) });
  assert.match(html, /No details were given\./);
});

test("hostile details are escaped text: no element, no link, no attribute breakout", () => {
  const hostile = `<script>alert(1)</script><a href="https://evil.example">click</a><img src=x onerror=alert(1)>" onmouseover="x`;
  const html = render({ ok: true, report: report({ details: hostile }) });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes('href="https://evil.example"'));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;a href=/);
});

test("not found, not configured and unavailable render a plain message and no form", () => {
  for (const [reason, text] of [
    ["not_found", /No report with that id exists\./],
    ["not_configured", /not configured on this deployment/],
    ["unavailable", /could not be reached/],
  ]) {
    const html = render({ ok: false, reason });
    assert.match(html, text);
    assert.match(html, new RegExp(`data-state="${reason}"`));
    assert.ok(!html.includes("<form"));
  }
});

test("describeDecisionStatus: only 200 is success; 409 is the first decision standing", () => {
  assert.deepEqual(describeDecisionStatus(200), { kind: "done" });
  assert.deepEqual(describeDecisionStatus(409), { kind: "already_closed" });
  for (const s of [400, 401, 403, 404, 413, 429, 500, 502, 503, 0]) {
    const o = describeDecisionStatus(s);
    assert.equal(o.kind, "error", `status ${s}`);
    assert.ok(o.message.length > 0);
  }
});

test("the form offers exactly the four decisions the store accepts", () => {
  assert.deepEqual(DECISION_OPTIONS.map((o) => o.value), ["no_action", "relabel", "remove", "escalate"]);
});
