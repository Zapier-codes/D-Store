import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReportedDownloads, reportedStatsFor } from "../lib/third-party-stats";

// Leaf 5.d.iv.zi.
const stats = { rating: { average: 3.8, total: 108, votes: null }, downloads: 500_000_000 };

test("reportedStatsFor: a third-party app's own stats, and null when it has none", () => {
  assert.equal(reportedStatsFor({ origin: "aptoide", third_party_stats: stats }), stats);
  assert.equal(reportedStatsFor({ origin: "aptoide" }), null);
  assert.equal(reportedStatsFor({ origin: "aptoide", third_party_stats: null as never }), null);
});

test("reportedStatsFor: a first-party app never shows them, whatever the field holds", () => {
  assert.equal(reportedStatsFor({ origin: "zealot", third_party_stats: stats }), null);
});

test("formatReportedDownloads: a lower bound, rounded down to one decimal", () => {
  assert.equal(formatReportedDownloads(2_000_000_000), "2B+");
  assert.equal(formatReportedDownloads(500_000_000), "500M+");
  assert.equal(formatReportedDownloads(1_500_000), "1.5M+");
  assert.equal(formatReportedDownloads(1_999_999), "1.9M+"); // never claims more than was reported
  assert.equal(formatReportedDownloads(1_000), "1K+");
  assert.equal(formatReportedDownloads(750), "750+");
  assert.equal(formatReportedDownloads(0), "0");
});

test("formatReportedDownloads: non-finite and negative input is 0 and never throws", () => {
  for (const input of [NaN, Infinity, -Infinity, -5]) assert.equal(formatReportedDownloads(input), "0");
});
