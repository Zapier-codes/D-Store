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
