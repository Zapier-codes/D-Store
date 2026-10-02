import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readAptoideStats } from "../lib/sources/aptoide";

// Leaf 5.d.iv.zi — the reader check `5.h.vii.zi` left owed. Run from the repo root (`npm test`).
type Raw = { stats?: unknown };
const snapshot: Raw[] = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/aptoide-snapshot-12.json"), "utf8"));

const votes = (counts: [number, number, number, number, number]) =>
  [5, 4, 3, 2, 1].map((value, i) => ({ value, count: counts[i] }));

test("the 12-app fixture (frozen copy of the first real snapshot): every app reads to a rating and a download figure", () => {
  assert.equal(snapshot.length, 12);
  let totalRatings = 0;
  let noRatings = 0;
  for (const raw of snapshot) {
    const result = readAptoideStats(raw);
    assert.ok(result !== null && result.rating !== null && result.downloads !== null);
    assert.ok(Number.isInteger(result.downloads) && result.downloads > 0);
    assert.ok(result.rating.average >= 0 && result.rating.average <= 5);
    assert.ok(result.rating.votes !== null, "the snapshot's histograms are complete");
    assert.deepEqual(result.rating.votes.map((v) => v.star), [5, 4, 3, 2, 1]);
    assert.equal(result.rating.votes.reduce((sum, v) => sum + v.count, 0), result.rating.total);
    totalRatings += result.rating.total;
    if (result.rating.total === 0) noRatings++;
  }
  assert.equal(totalRatings, 164);
  assert.equal(noRatings, 3);
});

test("the reader takes rating from stats.rating, not stats.prating, and downloads from stats.downloads, not stats.pdownloads", () => {
  const result = readAptoideStats({
    stats: {
      rating: { avg: 4, total: 2, votes: votes([1, 1, 0, 0, 0]) },
      prating: { avg: 1, total: 999, votes: votes([0, 0, 0, 0, 999]) },
      downloads: 1000,
      pdownloads: 7,
    },
  });
  assert.deepEqual(result, {
    rating: {
      average: 4,
      total: 2,
      votes: [
        { star: 5, count: 1 },
        { star: 4, count: 1 },
        { star: 3, count: 0 },
        { star: 2, count: 0 },
        { star: 1, count: 0 },
      ],
    },
    downloads: 1000,
  });
});

test("a non-object raw or stats is null and never throws", () => {
  for (const raw of [null, undefined, {}, { stats: null }, { stats: 5 }, { stats: "x" }, { stats: [] }]) {
    assert.equal(readAptoideStats(raw as Raw), null);
  }
});

test("hostile counts are refused: NaN, Infinity, negative, string, missing", () => {
  for (const downloads of [NaN, Infinity, -1, "500", null, undefined, {}]) {
    assert.equal(readAptoideStats({ stats: { downloads } }), null, String(downloads));
  }
  assert.deepEqual(readAptoideStats({ stats: { downloads: 12.9 } }), { rating: null, downloads: 12 }); // floored
});

test("hostile ratings are refused whole: bad avg or bad total", () => {
  for (const rating of [
    { avg: NaN, total: 1 },
    { avg: -0.1, total: 1 },
    { avg: 5.1, total: 1 },
    { avg: "4", total: 1 },
    { avg: 4, total: -1 },
    { avg: 4, total: "1" },
    { avg: 4 },
    null,
    5,
  ]) {
    assert.equal(readAptoideStats({ stats: { rating, downloads: 10 } })?.rating, null, JSON.stringify(rating));
  }
});

test("the vote histogram is kept only when complete and equal to the total; average and total survive without it", () => {
  const keep = readAptoideStats({ stats: { rating: { avg: 4, total: 3, votes: votes([1, 1, 1, 0, 0]) } } });
  assert.ok(keep?.rating?.votes !== null);

  const cases: unknown[] = [
    undefined, // missing votes
    "x",
    votes([1, 1, 0, 0, 0]), // sums to 2, total is 3
    votes([1, 1, 1, 0, 0]).slice(0, 4), // one star missing
    votes([1, 1, 1, 0, 0]).map((v, i) => (i === 0 ? { ...v, count: NaN } : v)), // hostile count
    votes([1, 1, 1, 0, 0]).map((v, i) => (i === 0 ? { ...v, count: -1 } : v)),
  ];
  for (const bad of cases) {
    const result = readAptoideStats({ stats: { rating: { avg: 4, total: 3, votes: bad } } });
    assert.deepEqual(result?.rating, { average: 4, total: 3, votes: null }, JSON.stringify(bad));
  }
});
