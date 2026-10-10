import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baseStatsFor,
  combinedDownloadTotal,
  combinedRating,
  formatDownloadCount,
  carriedOverReviewsFor,
  anonymousReviewsFor,
  mergeAppReviews,
  rankableDownloads,
} from "../lib/carried-over-stats";

// Task 45b / 45d. Written, NOT run (standing no-testing instruction).
const firstParty = {
  origin: "zealot" as const,
  base_stats: { downloads: 5_789_000, rating: { average: 4.6, count: 10 } },
  install_count: 40,
  avg_rating: 4.0,
  rating_count: 2,
  carried_over_reviews: [
    { author_name: "Amina K.", rating: 5, body: "Good.", commented_on: "2026-09-02T00:00:00Z", helpful_count: 41 },
  ],
};

test("baseStatsFor: reads a first-party app's carried-over base, null for third-party or none", () => {
  assert.deepEqual(baseStatsFor(firstParty), { downloads: 5_789_000, rating: { average: 4.6, count: 10 } });
  assert.equal(baseStatsFor({ origin: "zealot", base_stats: null }), null);
  assert.equal(baseStatsFor({ origin: "aptoide", base_stats: firstParty.base_stats }), null);
});

test("combinedDownloadTotal: the base alone (the store's own count is NOT added, GitHub already counts it), null when there is no base", () => {
  assert.equal(combinedDownloadTotal(firstParty), 5_789_000);
  assert.equal(combinedDownloadTotal({ origin: "zealot", base_stats: null, install_count: 40 }), null);
});

test("combinedRating: weighted average of the base and the store's own, null when there is no base", () => {
  // (4.6*10 + 4.0*2) / 12 = 4.5
  assert.deepEqual(combinedRating(firstParty), { average: 4.5, count: 12 });
  assert.equal(combinedRating({ origin: "zealot", base_stats: null, avg_rating: 4, rating_count: 2 }), null);
});

test("combinedRating: the base alone when the store has no own ratings", () => {
  const app = { origin: "zealot" as const, base_stats: { downloads: 10, rating: { average: 4.6, count: 10 } }, avg_rating: 0, rating_count: 0 };
  assert.deepEqual(combinedRating(app), { average: 4.6, count: 10 });
});

test("rankableDownloads: the base total (no double count) when there is a base, else the store's own count", () => {
  assert.equal(rankableDownloads(firstParty), 5_789_000);
  assert.equal(rankableDownloads({ origin: "zealot", base_stats: null, install_count: 40 }), 40);
});

test("formatDownloadCount: Play-Store-style short numbers", () => {
  assert.equal(formatDownloadCount(5_789_000), "5.8M");
  assert.equal(formatDownloadCount(1_500_000), "1.5M");
  assert.equal(formatDownloadCount(999_950), "1M"); // promotes, never "1000K"
  assert.equal(formatDownloadCount(2_000_000_000), "2B");
  assert.equal(formatDownloadCount(12_400), "12.4K");
  assert.equal(formatDownloadCount(750), "750");
  assert.equal(formatDownloadCount(0), "0");
});

test("formatDownloadCount: non-finite and negative input is 0 and never throws", () => {
  for (const input of [NaN, Infinity, -Infinity, -5]) assert.equal(formatDownloadCount(input), "0");
});

test("carriedOverReviewsFor: a first-party app's comments, [] for third-party or none", () => {
  assert.deepEqual(carriedOverReviewsFor(firstParty), firstParty.carried_over_reviews);
  assert.deepEqual(carriedOverReviewsFor({ origin: "zealot" }), []);
  assert.deepEqual(carriedOverReviewsFor({ origin: "aptoide", carried_over_reviews: firstParty.carried_over_reviews }), []);
});

test("mergeAppReviews: one unlabelled list, newest first, carried-over and live together", () => {
  const merged = mergeAppReviews(
    [{ author_name: "Amina K.", rating: 5, body: "Good.", commented_on: "2026-09-02T00:00:00Z", helpful_count: 41 }],
    [{ id: "review-1", stars: 3, created_at: "2026-10-01T00:00:00Z" }]
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].date, "2026-10-01T00:00:00Z"); // newest first
  assert.equal(merged[0].author, "A visitor");
  assert.equal(merged[0].rating, 3);
  assert.equal(merged[1].author, "Amina K.");
  assert.equal(merged[1].body, "Good.");
  assert.equal(merged[1].helpful_count, 41);
});

test("mergeAppReviews: a carried-over dev_reply and its date are carried through, absent one is null (cards D-P6/Z-P8)", () => {
  const merged = mergeAppReviews(
    [
      { author_name: "A", rating: 5, body: "Nice", commented_on: "2026-09-02T00:00:00Z", helpful_count: 1, dev_reply: "Thanks!", dev_replied_at: "2026-09-04T00:00:00Z" },
      { author_name: "B", rating: 3, body: "Meh", commented_on: "2026-09-01T00:00:00Z", helpful_count: 0 },
    ],
    [],
  );
  assert.equal(merged[0].dev_reply, "Thanks!");
  assert.equal(merged[0].dev_replied_at, "2026-09-04T00:00:00Z");
  assert.equal(merged[1].dev_reply, null);
  assert.equal(merged[1].dev_replied_at, null);
});

// Z-P9 — anonymous reviews (device-bound key). A third-party app never shows them, same posture the carried-over
// helpers already take; a first-party app with none reads as [].
test("anonymousReviewsFor: a first-party app's live anonymous reviews, [] for third-party or none", () => {
  const app = {
    origin: "zealot" as const,
    anonymous_reviews: [
      {
        rating: 5,
        body: "Fast and honest.",
        verified_install: true,
        version_code: "42",
        helpful_count: 3,
        created_at: "2026-10-05T00:00:00Z",
      },
    ],
  };
  assert.equal(anonymousReviewsFor(app).length, 1);
  assert.equal(anonymousReviewsFor(app)[0].verified_install, true);
  assert.deepEqual(anonymousReviewsFor({ origin: "zealot", anonymous_reviews: [] }), []);
  assert.deepEqual(anonymousReviewsFor({ origin: "aptoide", anonymous_reviews: app.anonymous_reviews }), []);
});

test("mergeAppReviews: anonymous reviews join the list, anonymous by design, verified mark preserved (Z-P9)", () => {
  const merged = mergeAppReviews(
    [],
    [],
    [
      {
        rating: 4,
        body: "Solid.",
        verified_install: true,
        version_code: "42",
        helpful_count: 2,
        created_at: "2026-10-05T00:00:00Z",
      },
      {
        rating: 2,
        body: null,
        verified_install: false,
        version_code: null,
        helpful_count: 0,
        created_at: "2026-10-04T00:00:00Z",
      },
    ],
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].date, "2026-10-05T00:00:00Z"); // newest first
  assert.equal(merged[0].author, "A visitor"); // no account, so no author
  assert.equal(merged[0].body, "Solid.");
  assert.equal(merged[0].verified_install, true);
  assert.equal(merged[0].helpful_count, 2);
  assert.equal(merged[1].verified_install, false);
  assert.equal(merged[1].body, null);
});

test("mergeAppReviews: an anonymous review has no verified mark unless earned, and the arg defaults to none", () => {
  // The two-argument call (every existing caller) still works and marks nothing.
  const withoutAnonymous = mergeAppReviews([], [{ id: "review-1", stars: 5, created_at: "2026-10-01T00:00:00Z" }]);
  assert.equal(withoutAnonymous.length, 1);
  assert.equal(withoutAnonymous[0].verified_install, false);

  const unmarked = mergeAppReviews([], [], [
    { rating: 3, body: "ok", verified_install: false, version_code: null, helpful_count: 0, created_at: "2026-10-01T00:00:00Z" },
  ]);
  assert.equal(unmarked[0].verified_install, false);
});
