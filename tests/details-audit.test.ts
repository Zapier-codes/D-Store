import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

/**
 * The details page's motion, accessibility and cleanup audit (operator-directed 2026-10-08, slice 7 of the rework).
 * Source-text guards, the way tests/stat-strip.test.ts does; the sandbox that wrote them could not render the page.
 * Written, not run.
 */

const read = (path: string) => readFileSync(path, "utf8");
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");

const glass = read("components/glass/glass.module.css");
const pageCss = read("app/app/[slug]/page.module.css");
const loading = read("app/app/[slug]/loading.tsx");

/** Every stylesheet that draws a part of the details page. */
const DETAILS_CSS = [
  "AppHeader", "StatStrip", "AppInformation", "RatingBoard", "ReviewsList", "RateThisApp", "ScreenshotCarousel",
  "Lightbox", "InstallCard", "StickyInstallBar", "ExpandableDescription", "Changelog", "PermissionsDisclosure",
  "ReportProblem", "ReportAppForm",
].map((name) => [name, read(`components/${name}.module.css`)] as const);

test("the shared layer defines the motion tokens once, and every glass section reads them with the same fallbacks", () => {
  for (const token of ["--glass-dur-fast: 160ms", "--glass-dur-base: 240ms", "--glass-dur-slow: 420ms", "--glass-ease: cubic-bezier(0.22, 1, 0.36, 1)", "--glass-spring: cubic-bezier(0.34, 1.56, 0.64, 1)"]) {
    assert.ok(glass.includes(token), token);
  }
  for (const name of ["Changelog", "ExpandableDescription", "ReportAppForm"]) {
    assert.match(read(`components/${name}.module.css`), /var\(--glass-dur-fast, 160ms\)/, name);
  }
  assert.match(read("components/Changelog.module.css"), /var\(--glass-dur-base, 240ms\)/);
});

test("the pointer-driven pieces do not move or fade for visitors who asked for reduced motion", () => {
  assert.match(glass, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.rim,\s*\.art,\s*\.nameWrap\s*\{\s*transition:\s*none/);
  assert.match(read("components/AppHeader.module.css"), /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.iconWrap\s*\{\s*transition:\s*none/);
});

test("nothing loops outside the no-preference media query, and only transform and opacity (and the ring's angle) animate", () => {
  for (const [name, css] of DETAILS_CSS.concat([["glass", glass] as const])) {
    for (const loop of code(css).matchAll(/animation:[^;]*\binfinite\b[^;]*;/g)) {
      const before = code(css).slice(0, loop.index);
      const lastMedia = before.lastIndexOf("@media");
      assert.ok(lastMedia >= 0 && /prefers-reduced-motion: no-preference/.test(before.slice(lastMedia)), `${name}: ${loop[0]}`);
    }
  }
});

test("no details-page text is dimmed with opacity or painted with the border colour", () => {
  for (const [name, css] of DETAILS_CSS) {
    assert.ok(!/color:\s*var\(--color-border\)/.test(code(css)), `${name} paints text with the border colour`);
  }
  assert.ok(!/\.summary\s*\{[^}]*opacity/.test(read("components/AppHeader.module.css")), "the header summary is solid text");
  assert.ok(!/\.counter\s*\{[^}]*opacity/.test(read("components/Lightbox.module.css")), "the lightbox counter is solid text");
});

test("the section reveal is scroll-driven, behind @supports and no-preference, with no JavaScript", () => {
  assert.match(pageCss, /@supports \(animation-timeline: view\(\)\)\s*\{\s*@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(pageCss, /animation-timeline:\s*view\(\)/);
  const keyframes = /@keyframes sectionIn\s*\{[\s\S]*?\n\}/.exec(pageCss)?.[0] ?? "";
  assert.ok(/opacity/.test(keyframes) && /transform/.test(keyframes) && !/(width|height|margin|top|left|filter)/.test(keyframes));
});

test("the dead pieces are gone and nothing imports them", () => {
  for (const name of ["FirstPartyStats", "ReportedStats", "DataSafety", "PlayStoreDisclosure", "ChecksumDisplay", "SignatureInfo", "ThirdPartyNotice"]) {
    assert.ok(!existsSync(`components/${name}.tsx`), name);
    assert.ok(!existsSync(`components/${name}.module.css`), `${name} css`);
  }
  // VersionHistory stays: PermissionDiffNotice imports its stylesheet and tests/version-history-render.test.ts renders it.
  assert.ok(existsSync("components/VersionHistory.tsx"));
});

test("the loading skeleton has the strip and the two-column shape the page has", () => {
  assert.match(loading, /styles\.columns/);
  assert.match(loading, /styles\.mainCol/);
  assert.match(loading, /styles\.side/);
  assert.match(loading, /height="88px"/);
});
