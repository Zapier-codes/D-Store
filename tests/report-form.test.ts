// @ts-nocheck -- loads a .tsx component through a CSS-module stub; the stub and the global React are test-only
import { test } from "node:test";
import assert from "node:assert/strict";

// Leaf 3.c.x.zi. Written without being run, at the operator's request. Same harness as
// tests/report-queue-render.test.ts. The submit handler needs a DOM, so what is tested here is the
// status mapping (the only logic that decides what the visitor is told) and the initial markup.
const req = (globalThis as any).require ?? require;
req.extensions[".css"] = (m: any) => {
  m.exports = { __esModule: true, default: new Proxy({}, { get: (_t, k) => String(k) }) };
};
const React = req("react");
(globalThis as any).React = React;
const { renderToStaticMarkup } = req("react-dom/server");
const mod = req("../components/ReportAppForm");
const ReportAppForm = mod.default;
const { describeReportStatus } = mod;
const { REPORT_REASONS } = req("../lib/report-intake");

test("only 200 is success", () => {
  assert.deepEqual(describeReportStatus(200), { kind: "done" });
  for (const s of [0, 201, 204, 301, 400, 404, 413, 429, 500, 502, 503]) {
    assert.equal(describeReportStatus(s).kind, "error", `status ${s}`);
  }
});

test("each documented failure has its own plain message", () => {
  const msg = (s: number) => describeReportStatus(s).message;
  assert.match(msg(429), /Too many reports/);
  assert.match(msg(404), /could not be found/);
  assert.match(msg(400), /not accepted/);
  assert.equal(msg(400), msg(413));
  assert.match(msg(503), /not available/);
  assert.match(msg(502), /could not be saved/);
  assert.match(msg(418), /could not be sent/);
  for (const s of [400, 404, 429, 502, 503, 418]) assert.ok(!/has been (sent|noted)/i.test(msg(s)), `status ${s}`);
});

test("initial markup: a disabled submit, no error, no confirmation", () => {
  const html = renderToStaticMarkup(React.createElement(ReportAppForm, { appSlug: "whatsapp" }));
  assert.match(html, /<form/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Submit report</);
  assert.ok(!html.includes('role="alert"'));
  assert.ok(!html.includes("your report has been"));
});

test("the form offers exactly the reasons the route accepts", () => {
  const html = renderToStaticMarkup(React.createElement(ReportAppForm, { appSlug: "whatsapp" }));
  for (const r of REPORT_REASONS) assert.ok(html.includes(`value="${r}"`), r);
  const options = [...html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(options, [...REPORT_REASONS]);
});
