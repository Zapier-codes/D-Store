import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * Source-text guards for the stat strip and the Information list (operator-directed 2026-10-08, slice 2 of the
 * details page rework). The sandbox that wrote them could not render the page, so these pin the contracts the
 * brief names, the way tests/app-header.test.ts and tests/glass-layer.test.ts do. Written, not run.
 */

const strip = readFileSync("components/StatStrip.tsx", "utf8");
const stripCss = readFileSync("components/StatStrip.module.css", "utf8");
const info = readFileSync("components/AppInformation.tsx", "utf8");
const infoCss = readFileSync("components/AppInformation.module.css", "utf8");
const page = readFileSync("app/app/[slug]/page.tsx", "utf8");
const countUp = readFileSync("components/CountUp.tsx", "utf8");

const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("the strip and the list are built from the shared glass layer, not copies of the hero's CSS", () => {
  assert.match(stripCss, /composes:\s*scope panel from "\.\/glass\/glass\.module\.css"/);
  assert.match(infoCss, /composes:\s*scope from "\.\/glass\/glass\.module\.css"/);
  assert.match(infoCss, /composes:\s*panel from "\.\/glass\/glass\.module\.css"/);
  assert.match(strip, /StarMeter/);
  assert.match(strip, /from "\.\/glass"/);
  assert.ok(!/@keyframes|animation:/.test(stripCss + infoCss), "no animation of its own: no flare, no shimmer");
  assert.ok(!/backdrop-filter/.test(stripCss + infoCss), "blur comes from the shared panel only");
});

test("the strip scrolls and snaps, and the scroller is a labelled, focusable region", () => {
  assert.match(stripCss, /overflow-x:\s*auto/);
  assert.match(stripCss, /scroll-snap-type:\s*x/);
  assert.match(stripCss, /scroll-snap-align:\s*start/);
  assert.match(strip, /role="region"/);
  assert.match(strip, /aria-label="App facts"/);
  assert.match(strip, /tabIndex=\{0\}/);
  assert.match(stripCss, /\.scroller:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--glass-accent-text\)/);
});

test("the downloads figure is the shared CountUp, and CountUp can write a reported lower bound", () => {
  assert.match(strip, /<CountUp\b/);
  assert.match(countUp, /"reported"/);
  assert.match(countUp, /formatReportedDownloads/);
  assert.match(stripCss, /font-variant-numeric:\s*tabular-nums/);
});

test("both components draw only what the helpers return: no placeholder, no source wording, no data of their own", () => {
  for (const source of [strip, info]) {
    const text = code(source);
    assert.ok(!/not provided/i.test(text));
    assert.ok(!/aptoide|third-party|third party/i.test(text.replace(/isThirdParty|thirdParty/g, "")));
    assert.ok(!/size_mb|min_android_version|content_rating|\.license|avg_rating|install_count/.test(text), "reads facts through lib/app-facts.ts");
  }
  assert.match(strip, /statTilesFor\(app\)/);
  assert.match(info, /infoRowsFor\(app,/);
});

test("an empty strip and an empty list render nothing at all", () => {
  assert.match(strip, /tiles\.length === 0\) return null/);
  assert.match(info, /rows\.length === 0\) return null/);
});

test("text is never painted with the border colour or the decorative accent", () => {
  for (const css of [stripCss, infoCss]) {
    assert.ok(!/color:\s*var\(--color-border/.test(css));
    assert.ok(!/(^|[^-])color:\s*#38bdf8/i.test(css));
    assert.ok(!/(^|[^-])color:\s*var\(--glass-accent\)/.test(css), "decoration tone is not for text");
  }
  assert.match(stripCss, /\.valueAccent\s*\{\s*color:\s*var\(--glass-accent-text\)/);
  assert.match(infoCss, /\.link\s*\{[^}]*color:\s*var\(--glass-accent-text\)/);
});

test("the Information list is its own section with a heading, a definition list, and the right place on the page", () => {
  assert.match(info, /<h2 id="information-heading"/);
  assert.match(info, /<dl\b/);
  const diff = page.indexOf("<PermissionDiffNotice");
  const list = page.indexOf("<AppInformation");
  const ratings = page.indexOf('aria-labelledby="ratings-heading"');
  assert.ok(diff > 0 && list > diff && ratings > list, "after What's New and its permission notice, before Ratings");
});

test("fallbacks: forced colours keep the hairlines visible", () => {
  assert.match(stripCss, /@media \(forced-colors: active\)/);
  assert.match(infoCss, /@media \(forced-colors: active\)/);
});

test("a short strip fills its column from tablet up: the desktop tile drops the phone max-width cap", () => {
  // Operator-reported 2026-10-09: a first-party app (three or four tiles) left a large empty glass band
  // beside its tiles on desktop, because each tile stopped growing at the phone's 14rem cap. A third-party
  // app's six tiles reached the cap and hid it. The fix lifts the cap once the row stops being a scroller.
  assert.match(stripCss, /max-width:\s*14rem/);
  const desktop = stripCss.match(/@media \(min-width: 768px\)\s*\{[\s\S]*?\n\}/);
  assert.ok(desktop, "a min-width:768px block exists");
  assert.match(desktop[0], /max-width:\s*none/, "the tile cap is lifted from tablet up so tiles fill the row");
});
