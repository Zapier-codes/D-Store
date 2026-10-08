import assert from "node:assert/strict";
import test from "node:test";
import { ambientArtFor, nearestSlideIndex, neighbourIndexes, shapeOf, swipeStep, usableScreenshots, wrapIndex } from "../lib/gallery";

test("usableScreenshots drops blanks and non-strings, keeps order", () => {
  assert.deepEqual(usableScreenshots(["a", "", "  ", "b"]), ["a", "b"]);
  assert.deepEqual(usableScreenshots(null), []);
  assert.deepEqual(usableScreenshots(undefined), []);
  assert.deepEqual(usableScreenshots([1, null, "c"] as unknown[]), ["c"]);
});

test("shapeOf reads orientation and refuses bad sizes", () => {
  assert.equal(shapeOf(1080, 1920), "portrait");
  assert.equal(shapeOf(1920, 1080), "landscape");
  assert.equal(shapeOf(100, 100), "portrait");
  assert.equal(shapeOf(0, 10), null);
  assert.equal(shapeOf(NaN, 10), null);
});

test("nearestSlideIndex picks the slide closest to the scroll position", () => {
  assert.equal(nearestSlideIndex([0, 200, 400], 0), 0);
  assert.equal(nearestSlideIndex([0, 200, 400], 120), 1);
  assert.equal(nearestSlideIndex([0, 200, 400], 390), 2);
  assert.equal(nearestSlideIndex([], 50), 0);
  assert.equal(nearestSlideIndex([0, 200], NaN), 0);
});

test("wrapIndex loops both ways", () => {
  assert.equal(wrapIndex(3, 3), 0);
  assert.equal(wrapIndex(-1, 3), 2);
  assert.equal(wrapIndex(1, 3), 1);
  assert.equal(wrapIndex(5, 0), 0);
});

test("swipeStep needs a long, mostly horizontal move", () => {
  assert.equal(swipeStep(-80, 5), -1);
  assert.equal(swipeStep(80, 5), 1);
  assert.equal(swipeStep(-20, 0), 0);
  assert.equal(swipeStep(-80, 70), 0);
  assert.equal(swipeStep(NaN, 0), 0);
});

test("neighbourIndexes lists previous and next once", () => {
  assert.deepEqual(neighbourIndexes(0, 1), []);
  assert.deepEqual(neighbourIndexes(0, 2), [1]);
  assert.deepEqual(neighbourIndexes(0, 4), [3, 1]);
  assert.deepEqual(neighbourIndexes(2, 4), [1, 3]);
});

test("ambientArtFor accepts only CSS-safe https URLs", () => {
  assert.equal(ambientArtFor("https://a/x.png"), "https://a/x.png");
  assert.equal(ambientArtFor("http://a/x.png"), null);
  assert.equal(ambientArtFor('https://a/x.png")}'), null);
  assert.equal(ambientArtFor("https://a/x y.png"), null);
  assert.equal(ambientArtFor(null), null);
});
