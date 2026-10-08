import assert from "node:assert/strict";
import test from "node:test";
import {
  averageText,
  histogramLabel,
  histogramRows,
  reviewDateLabel,
  reviewInitial,
  splitReviews,
  starRippleDelay,
} from "../lib/ratings";

test("histogramRows orders 5 to 1, fills missing stars with 0 and scales to the biggest row", () => {
  const rows = histogramRows([
    { star: 5, count: 41 },
    { star: 4, count: 1 },
    { star: 1, count: 40 },
  ]);
  assert.ok(rows);
  assert.deepEqual(rows!.map((r) => r.star), [5, 4, 3, 2, 1]);
  assert.deepEqual(rows!.map((r) => r.count), [41, 1, 0, 0, 40]);
  assert.equal(rows![0].percent, 100);
  assert.equal(rows![2].percent, 0);
  assert.equal(rows![4].percent, 97.6);
});

test("histogramRows refuses missing, empty, all-zero and malformed votes (nothing is invented)", () => {
  assert.equal(histogramRows(null), null);
  assert.equal(histogramRows(undefined), null);
  assert.equal(histogramRows([]), null);
  assert.equal(histogramRows([{ star: 5, count: 0 }]), null);
  assert.equal(histogramRows([{ star: 9, count: 4 }, { star: 3, count: -2 }]), null);
});

test("histogramRows adds repeated stars and floors fractions", () => {
  const rows = histogramRows([{ star: 5, count: 2.9 }, { star: 5, count: 3 }]);
  assert.equal(rows![0].count, 5);
});

test("averageText gives one decimal and 0.0 for nonsense", () => {
  assert.equal(averageText(4.62), "4.6");
  assert.equal(averageText(3), "3.0");
  assert.equal(averageText(NaN), "0.0");
  assert.equal(averageText(-1), "0.0");
});

test("starRippleDelay steps by index", () => {
  assert.equal(starRippleDelay(0), 0);
  assert.equal(starRippleDelay(3), 210);
  assert.equal(starRippleDelay(-1), 0);
});

test("histogramLabel reads every row", () => {
  const rows = histogramRows([{ star: 5, count: 1200 }])!;
  assert.ok(histogramLabel(rows).startsWith("5 star: 1,200 ratings, 4 star: 0 ratings"));
});

test("reviewInitial and reviewDateLabel are safe on bad input", () => {
  assert.equal(reviewInitial("  maya otto"), "M");
  assert.equal(reviewInitial(""), "?");
  assert.equal(reviewInitial(null), "?");
  assert.equal(reviewDateLabel("2026-10-08T23:30:00Z"), "Oct 8, 2026");
  assert.equal(reviewDateLabel("nope"), "");
  assert.equal(reviewDateLabel(undefined), "");
});

test("splitReviews keeps the first few and folds the rest", () => {
  const { shown, rest } = splitReviews([1, 2, 3, 4, 5]);
  assert.deepEqual(shown, [1, 2, 3]);
  assert.deepEqual(rest, [4, 5]);
  assert.deepEqual(splitReviews([1], 3), { shown: [1], rest: [] });
});
