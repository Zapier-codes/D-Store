import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/** Source-text guards for slice 3 (screenshot gallery and lightbox); the repo's pattern for components (see app-header.test.ts). */
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the page no longer draws its own Screenshots heading (no orphan heading for an app without screenshots)", () => {
  const page = read("app/app/[slug]/page.tsx");
  assert.ok(page.includes("<ScreenshotCarousel app={app} />"));
  assert.ok(!page.includes("screenshots-heading"));
});

test("the gallery owns the section and collapses when there is nothing to show", () => {
  const src = read("components/ScreenshotCarousel.tsx");
  assert.ok(src.includes('id="screenshots-heading"'));
  assert.ok(src.includes("if (count === 0) return null;"));
  // Every hook is called before that early return.
  const early = src.indexOf("if (count === 0) return null;");
  for (const hook of ["useState(", "useRef(", "useCallback(", "useEffect("]) {
    assert.ok(src.lastIndexOf(hook) < early, `${hook} must come before the early return`);
  }
});

test("the gallery reserves space and keeps one blurred layer, with no looping animation", () => {
  const css = read("components/ScreenshotCarousel.module.css");
  assert.ok(css.includes("aspect-ratio: 9 / 16"));
  assert.ok(css.includes("height: var(--shot-h)"));
  assert.equal((css.match(/filter:\s*blur\(/g) ?? []).length, 1);
  assert.ok(!/animation\s*:/.test(css));
  assert.ok(!/@keyframes/.test(css));
  assert.ok(css.includes("prefers-reduced-motion: no-preference"));
  assert.ok(css.includes("prefers-reduced-transparency"));
});

test("the lightbox keeps its dialog, Escape, arrows and focus return, and gains swipe and preloading", () => {
  const src = read("components/Lightbox.tsx");
  assert.ok(src.includes("showModal()"));
  assert.ok(src.includes('"ArrowRight"') && src.includes('"ArrowLeft"'));
  assert.ok(src.includes("swipeStep("));
  assert.ok(src.includes("neighbourIndexes("));
  assert.ok(src.includes('pointerType === "mouse"'));
  // Escape is the dialog's own behaviour: there must be no key handler that swallows it.
  assert.ok(!src.includes('"Escape"'));
});

test("the gallery text colours follow the theme tokens, never the border colour", () => {
  for (const f of ["components/ScreenshotCarousel.module.css", "components/Lightbox.module.css"]) {
    const css = read(f);
    assert.ok(!/(^|[;{\s])color:\s*var\(--color-border\)/.test(css), `${f} paints text with the border colour`);
  }
});

test("the shelf grid tracks can shrink, so one wide card cannot widen the page (details page, third-party app)", () => {
  const css = read("components/ShelfGrid.module.css");
  assert.ok(!/repeat\(\d, 1fr\)/.test(css), "a bare 1fr track cannot shrink below its content");
  assert.equal((css.match(/repeat\(\d, minmax\(0, 1fr\)\)/g) ?? []).length, 4);
  assert.ok(/\.card\s*\{[^}]*min-width:\s*0/.test(read("components/AppCard.module.css")));
  assert.ok(/overflow-x:\s*clip/.test(read("app/app/[slug]/page.module.css")));
});

test("rows that scroll sideways cannot widen the page: the stat strip and the gallery contain their inline size", () => {
  assert.ok(/\.strip\s*\{[^}]*contain:\s*inline-size/.test(read("components/StatStrip.module.css")));
  assert.ok(/\.carousel\s*\{[^}]*contain:\s*inline-size/.test(read("components/ScreenshotCarousel.module.css")));
});

test("slice 4: no synthesized histogram is left, and the ratings text colours follow the tokens", () => {
  const summary = read("components/RatingSummary.tsx");
  assert.ok(!summary.includes("syntheticHistogram"));
  assert.ok(!summary.includes("Math.exp"));
  assert.ok(summary.includes("ratingSummaryFor"));
  const lib = read("lib/ratings.ts");
  assert.ok(!lib.includes("Math.exp"), "the Gaussian synthesis must not come back");
  for (const f of ["components/RatingBoard.module.css", "components/RateThisApp.module.css", "components/ReviewsList.module.css", "components/RatingSummary.module.css"]) {
    const css = read(f);
    assert.ok(!/(^|[;{\s])color:\s*var\(--color-border\)/.test(css), `${f} paints text with the border colour`);
    assert.ok(!/opacity:\s*0\.[5-8]\d*\s*;/.test(css) || f.includes("RateThisApp"), `${f} dims text with opacity`);
  }
});

test("slice 4: the rating bars end at their final length with no script, and animate only transform, once", () => {
  const css = read("components/RatingBoard.module.css");
  assert.ok(css.includes("transform: scaleX(var(--p, 0))"));
  assert.ok(!/animation\s*:/.test(css) && !/@keyframes/.test(css));
  assert.ok(css.includes("prefers-reduced-motion: no-preference"));
  const tsx = read("components/RatingBoard.tsx");
  assert.ok(tsx.includes('useState<Phase>("static")'));
  assert.ok(tsx.includes("prefers-reduced-motion: reduce"));
  assert.ok(tsx.includes("observer.disconnect()"));
});

test("slice 4: the star picker keeps its radiogroup contract and the request", () => {
  const src = read("components/RateThisApp.tsx");
  assert.ok(src.includes('role="radiogroup"') && src.includes('role="radio"'));
  assert.ok(src.includes("/api/apps/${appSlug}/reviews"));
  assert.ok(src.includes('"Home"') && src.includes('"End"'));
  assert.ok(src.includes("starRippleDelay("));
});

test("slice 4: reviews fold behind a native details element", () => {
  const src = read("components/ReviewsList.tsx");
  assert.ok(src.includes("<details") && src.includes("splitReviews("));
  assert.ok(!src.includes('"use client"'));
});
