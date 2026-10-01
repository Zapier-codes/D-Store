// @ts-nocheck -- loads a .tsx component through a CSS-module stub; the stub and the global React are test-only
import { test } from "node:test";
import assert from "node:assert/strict";

// Leaf 5.c.xi.zo. Renders the real `components/VersionHistory.tsx` to static markup. A `.module.css` import
// cannot be loaded outside Next, so it is stubbed to return each class name as itself; the TSX is compiled
// with the classic transform here, so React is a global.
const req = (globalThis as any).require ?? require;
req.extensions[".css"] = (m: any) => {
  m.exports = { __esModule: true, default: new Proxy({}, { get: (_t, k) => String(k) }) };
};
const React = req("react");
(globalThis as any).React = React;
const { renderToStaticMarkup } = req("react-dom/server");
const VersionHistory = req("../components/VersionHistory").default;

const entry = (version_name: string, over: Record<string, unknown> = {}) => ({
  version_name,
  changelog: "notes",
  size_mb: 5,
  rollout_percentage: 100,
  rollout_status: "complete",
  status: "available",
  download_url: `https://example.invalid/${version_name}.apk`,
  permissions: [],
  ...over,
});
const render = (app: Record<string, unknown>) =>
  renderToStaticMarkup(React.createElement(VersionHistory, { app: { slug: "demo", ...app } }));
const count = (html: string, needle: string) => html.split(needle).length - 1;
const CAUTION = "Android may refuse to install an older version over a newer one";

test("a link state: older release gets a download link, the newest gets none, caution appears once", () => {
  const html = render({ version_history: [entry("3.0"), entry("2.0"), entry("1.0")] });
  assert.equal(count(html, 'href="https://example.invalid/2.0.apk"'), 1);
  assert.equal(count(html, 'href="https://example.invalid/1.0.apk"'), 1);
  assert.equal(count(html, "https://example.invalid/3.0.apk"), 0, "position 0 is never linked");
  assert.match(html, /Download version 2\.0/);
  // each link's href belongs to the version its own text names, and position 0 has no download link at all
  assert.match(html, /href="https:\/\/example\.invalid\/2\.0\.apk"[^>]*>Download version 2\.0</);
  assert.match(html, /href="https:\/\/example\.invalid\/1\.0\.apk"[^>]*>Download version 1\.0</);
  assert.equal(count(html, "Download version 3.0"), 0);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.equal(count(html, CAUTION), 1, "one caution however many links");
  assert.match(html, /may need\s+to be uninstalled first, which can remove its data/);
  assert.match(html, /may be missing fixes/);
});

for (const [name, over, text] of [
  ["pulled", { status: "pulled" }, "withdrawn this version"],
  ["halted", { status: "halted" }, "paused this version"],
  ["rolling_out", { rollout_status: "active", rollout_percentage: 30 }, "still rolling out"],
  ["no_link", { download_url: null }, "No download link is provided"],
] as const) {
  test(`withheld reason ${name}: a line, no link, and no caution when it is the only older entry`, () => {
    const html = render({ version_history: [entry("2.0"), entry("1.0", over)] });
    assert.match(html, new RegExp(text));
    assert.equal(count(html, "Download version"), 0);
    assert.equal(count(html, CAUTION), 0, "caution only when at least one link is shown");
  });
}

test("mixed: one link and one withheld line; the caution shows once", () => {
  const html = render({ version_history: [entry("3.0"), entry("2.0", { status: "pulled" }), entry("1.0")] });
  assert.equal(count(html, "Download version"), 1);
  assert.equal(count(html, "withdrawn this version"), 1);
  assert.equal(count(html, CAUTION), 1);
});

test("a single entry (the newest only): no link, no withheld line, no caution", () => {
  const html = render({ version_history: [entry("1.0", { status: "pulled" })] });
  assert.equal(count(html, "Download version"), 0);
  assert.equal(count(html, "withdrawn"), 0);
  assert.equal(count(html, CAUTION), 0);
});

test("no entries: the empty state", () => {
  const html = render({ version_history: [] });
  assert.match(html, /No earlier versions have been published yet\./);
  assert.equal(count(html, CAUTION), 0);
  assert.equal(render({}).includes("No earlier versions"), true, "a missing array reads as empty");
});

test("not provided: its own line, not the empty state", () => {
  const html = render({ not_provided: ["version_history"] });
  assert.match(html, /Not provided by source/);
  assert.equal(count(html, "No earlier versions"), 0);
});

test("omitted line: plural, singular and absent", () => {
  assert.match(render({ version_history: [entry("2.0")], version_history_omitted: 3 }), /3 more versions are not shown\./);
  assert.match(render({ version_history: [entry("2.0")], version_history_omitted: 1 }), /1 more version is not shown\./);
  assert.equal(count(render({ version_history: [entry("2.0")], version_history_omitted: 0 }), "not shown"), 0);
});

test("no wording names a cause or says security", () => {
  const html = render({ version_history: [entry("3.0"), entry("2.0"), entry("1.0", { status: "pulled" })] });
  assert.equal(/security|vulnerab/i.test(html), false);
});
