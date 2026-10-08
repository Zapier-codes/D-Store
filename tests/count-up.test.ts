import test from "node:test";
import assert from "node:assert/strict";
import { countUpValue, easeOutCubic } from "../lib/count-up";

test("easeOutCubic is clamped, monotonic, and front-loaded", () => {
  assert.equal(easeOutCubic(-1), 0);
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(easeOutCubic(2), 1);
  assert.equal(easeOutCubic(Number.NaN), 0);
  assert.ok(easeOutCubic(0.5) > 0.5);
  assert.ok(easeOutCubic(0.3) < easeOutCubic(0.6));
});

test("countUpValue starts at 0, ends exactly on the target, never overshoots", () => {
  assert.equal(countUpValue(5_789_000, 0), 0);
  assert.equal(countUpValue(5_789_000, 1), 5_789_000);
  assert.equal(countUpValue(5_789_000, 5), 5_789_000);
  for (let p = 0; p <= 1; p += 0.05) {
    const v = countUpValue(5_789_000, p);
    assert.ok(v >= 0 && v <= 5_789_000);
    assert.ok(Number.isInteger(v));
  }
});

test("countUpValue is 0 for a missing, zero, negative or non-finite target", () => {
  for (const target of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(countUpValue(target, 0.5), 0);
});
