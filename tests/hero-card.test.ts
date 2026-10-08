import assert from "node:assert/strict";
import test from "node:test";
import { pickHeroArt, ratingFillPercent, updatedLabel } from "../lib/hero-card";

test("pickHeroArt takes the first safe https screenshot", () => {
  assert.equal(pickHeroArt(["http://a/x.png", "https://b/y.png", "https://c/z.png"]), "https://b/y.png");
  assert.equal(pickHeroArt([]), null);
  assert.equal(pickHeroArt(null), null);
  assert.equal(pickHeroArt(undefined), null);
});

test("pickHeroArt refuses URLs that could break out of a CSS url()", () => {
  assert.equal(pickHeroArt(['https://a/x.png")}body{x:y']), null);
  assert.equal(pickHeroArt(["https://a/x y.png"]), null);
  assert.equal(pickHeroArt(["https://a/x(1).png"]), null);
  assert.equal(pickHeroArt(["https://a/x.png", ]), "https://a/x.png");
});

test("ratingFillPercent maps 0..5 to 0..100 and clamps", () => {
  assert.equal(ratingFillPercent(4.6), 92);
  assert.equal(ratingFillPercent(5), 100);
  assert.equal(ratingFillPercent(7), 100);
  assert.equal(ratingFillPercent(0), 0);
  assert.equal(ratingFillPercent(-1), 0);
  assert.equal(ratingFillPercent(NaN), 0);
  assert.equal(ratingFillPercent(null), 0);
});

test("updatedLabel is month and year in UTC, or null", () => {
  assert.equal(updatedLabel("2026-10-08T23:59:00Z"), "Updated Oct 2026");
  assert.equal(updatedLabel("2026-01-01T00:00:00Z"), "Updated Jan 2026");
  assert.equal(updatedLabel(""), null);
  assert.equal(updatedLabel("not a date"), null);
  assert.equal(updatedLabel(null), null);
});
