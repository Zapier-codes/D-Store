import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

/**
 * Guards for the shared glass layer (operator-directed 2026-10-08, slice 0 of the details page rework). These
 * read the stylesheets as text, the same way tests/theme-contrast.test.ts does, because the sandbox that wrote
 * this slice could not render the page. They pin the rules the design note says must not drift.
 */

const glass = readFileSync("components/glass/glass.module.css", "utf8");
const hero = readFileSync("components/Hero.module.css", "utf8");

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("the light accent pair: decoration sky blue, text-safe tone clears 4.5:1 on white", () => {
  const light = glass.match(/:global\(\[data-theme="light"\]\) \.scope\s*\{([^}]*)\}/)?.[1] ?? "";
  const decoration = light.match(/--glass-accent:\s*(#[0-9a-fA-F]{6})/)?.[1];
  const text = light.match(/--glass-accent-text:\s*(#[0-9a-fA-F]{6})/)?.[1];
  assert.equal(decoration?.toLowerCase(), "#38bdf8");
  assert.equal(text?.toLowerCase(), "#0369a1");
  assert.ok(ratio(text as string, "#ffffff") >= 4.5, `text tone on white: ${ratio(text as string, "#ffffff").toFixed(2)}`);
});

test("dark mode follows the category-aware accent token, not a fixed colour", () => {
  const scope = glass.match(/\.scope\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(scope, /--glass-accent:\s*var\(--color-accent\)/);
  assert.match(scope, /--glass-accent-text:\s*var\(--color-accent\)/);
});

test("the light-mode app name is clear glass: no accent colour anywhere in its rules", () => {
  const blocks = [...glass.matchAll(/:global\(\[data-theme="light"\]\) \.(?:name|nameWrap)(?:::after)?\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(blocks.length >= 3, "light-mode name rules exist");
  for (const block of blocks) assert.ok(!/--glass-accent|--color-accent|#38bdf8|#0369a1/i.test(block), block);
});

test("the name has a forced-colors fallback with no clipped text", () => {
  const forced = glass.match(/@media \(forced-colors: active\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(forced, /-webkit-text-fill-color:\s*currentColor/);
  assert.match(forced, /background-image:\s*none/);
});

test("reduced transparency drops the blur on the panel and the pills", () => {
  const block = glass.match(/@media \(prefers-reduced-transparency: reduce\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(block, /\.panel/);
  assert.match(block, /\.pill\s*\{/);
  assert.match(block, /backdrop-filter:\s*none/);
});

test("the ring spins only when motion is allowed", () => {
  const motion = glass.match(/@media \(prefers-reduced-motion: no-preference\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(motion, /\.ring\s*\{[^}]*animation:\s*glassRingSpin/);
  assert.ok(!/animation:\s*glassRingSpin/.test(glass.replace(motion, "")), "no ring animation outside the media query");
});

test("no sweeping flare, spotlight or shimmer loop in the shared layer", () => {
  assert.ok(!/flare|spotlight|shimmer/i.test(glass.replace(/\/\*[\s\S]*?\*\//g, "")));
});

test("the hero uses the shared scope and panel and no longer defines the moved rules itself", () => {
  assert.match(hero, /\.hero\s*\{\s*composes:\s*scope from "\.\/glass\/glass\.module\.css"/);
  assert.match(hero, /\.panel\s*\{\s*composes:\s*panel from "\.\/glass\/glass\.module\.css"/);
  for (const moved of [/^\.pill\b/m, /^\.pills\b/m, /^\.name\b/m, /^\.nameWrap\b/m, /^\.rim\b/m, /^\.ring\b/m, /^\.stars\b/m, /^\.tilt\b/m, /^\.art\b/m]) {
    assert.ok(!moved.test(hero), `Hero.module.css still defines ${moved}`);
  }
  assert.ok(!/@property --ring-angle/.test(hero), "the ring's @property lives in the shared layer only");
});

test("the primitives exist and the old HeroTilt is gone", () => {
  for (const file of ["GlassPill.tsx", "StarMeter.tsx", "AppNameTitle.tsx", "Tilt.tsx", "Decor.tsx", "BackdropArt.tsx", "index.ts"]) {
    assert.ok(existsSync(`components/glass/${file}`), file);
  }
  assert.ok(!existsSync("components/HeroTilt.tsx"));
});
