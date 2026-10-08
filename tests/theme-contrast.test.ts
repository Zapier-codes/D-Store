import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Theme contrast guard. Secondary text used to take --color-border (a hairline colour, 1.2:1 from the page),
 * so captions, rating rows, table headers and notices were nearly invisible in both themes. These tests read
 * the real tokens from app/globals.css and fail if a text token drops below WCAG AA, or if a CSS module
 * paints text with the border colour again.
 */

const css = readFileSync("app/globals.css", "utf8");

function tokens(theme: "dark" | "light"): Record<string, string> {
  const block = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}

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

for (const theme of ["dark", "light"] as const) {
  const t = tokens(theme);

  test(`${theme}: body and muted text reach 4.5:1 on the page and the surface`, () => {
    for (const name of ["--color-text", "--color-text-muted", "--color-accent"]) {
      assert.ok(t[name], `${name} is defined`);
      for (const base of ["--color-bg", "--color-surface"]) {
        assert.ok(ratio(t[name], t[base]) >= 4.5, `${theme} ${name} on ${base}: ${ratio(t[name], t[base]).toFixed(2)}`);
      }
    }
  });

  test(`${theme}: muted text is quieter than body text`, () => {
    assert.ok(ratio(t["--color-text"], t["--color-bg"]) > ratio(t["--color-text-muted"], t["--color-bg"]));
  });

  test(`${theme}: an empty rating star reaches the 3:1 bar for graphics`, () => {
    for (const base of ["--color-bg", "--color-surface"]) {
      assert.ok(ratio(t["--color-star-empty"], t[base]) >= 3, `${theme} star on ${base}`);
    }
  });
}

test("no CSS module paints text with the hairline border colour", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".next") walk(path);
      } else if (entry.name.endsWith(".module.css")) files.push(path);
    }
  };
  walk("components");
  walk("app");
  const offenders = files.filter((f) => /^\s*color:\s*var\(--color-border/m.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});
