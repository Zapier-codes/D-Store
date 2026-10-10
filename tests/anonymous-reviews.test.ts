import test from "node:test";
import assert from "node:assert/strict";
import { normalizeZealotApp, type RawApp } from "../lib/sources/zealot";

// Z-P9 — the reader half of anonymous reviews. The index publishes `anonymous_reviews` alongside `reviews`;
// this checks the reader maps it faithfully (never inventing a mark, dropping unusable rows) and, crucially,
// that an OLDER cached index with no such key reads as "none" rather than as an error.

function rawApp(over: Partial<RawApp> = {}): RawApp {
  return {
    id: 1,
    package_name: "com.example.app",
    publisher: { name: "Example", profile_url: null, verified: true },
    listing: {
      title: "Example",
      description: "An app.",
      icon: { url: null },
      content_rating: null,
      data_safety: {
        collects_data: null,
        data_types: [],
        shared_with_third_parties: null,
        encrypted_in_transit: null,
        deletion_request_url: null,
      },
      contains_ads: null,
      has_in_app_purchases: null,
    },
    slug: "example",
    summary: null,
    category: null,
    license: null,
    links: { site: null, source: null, tracker: null, donate: null },
    available_regions: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    versions: [],
    ...over,
  };
}

test("anonymous_reviews: mapped faithfully, verified mark copied only when true", () => {
  const app = normalizeZealotApp(
    rawApp({
      anonymous_reviews: [
        {
          rating: 5,
          body: "Great on my Pixel.",
          verified_install: true,
          version_code: "42",
          helpful_count: 7,
          created_at: "2026-10-05T00:00:00Z",
        },
        {
          rating: 3,
          body: null,
          verified_install: null,
          version_code: null,
          helpful_count: 0,
          created_at: "2026-10-04T00:00:00Z",
        },
      ],
    }),
  );
  assert.equal(app.anonymous_reviews?.length, 2);
  assert.deepEqual(app.anonymous_reviews?.[0], {
    rating: 5,
    body: "Great on my Pixel.",
    verified_install: true,
    version_code: "42",
    helpful_count: 7,
    created_at: "2026-10-05T00:00:00Z",
  });
  // A null mark is NOT assumed true.
  assert.equal(app.anonymous_reviews?.[1].verified_install, false);
  assert.equal(app.anonymous_reviews?.[1].body, null);
});

test("anonymous_reviews: an older cached index with no key reads as none, never as an error", () => {
  const app = normalizeZealotApp(rawApp());
  assert.deepEqual(app.anonymous_reviews, []);
});

test("anonymous_reviews: unusable rows (bad rating or missing date) are dropped, not rendered broken", () => {
  const app = normalizeZealotApp(
    rawApp({
      anonymous_reviews: [
        { rating: 0, body: "no stars", verified_install: false, version_code: null, helpful_count: 0, created_at: "2026-10-05T00:00:00Z" },
        { rating: 6, body: "too many", verified_install: false, version_code: null, helpful_count: 0, created_at: "2026-10-05T00:00:00Z" },
        { rating: 4, body: "no date", verified_install: false, version_code: null, helpful_count: 0, created_at: null },
        { rating: 4, body: "good", verified_install: true, version_code: "1", helpful_count: 1, created_at: "2026-10-06T00:00:00Z" },
      ],
    }),
  );
  assert.equal(app.anonymous_reviews?.length, 1);
  assert.equal(app.anonymous_reviews?.[0].body, "good");
});

test("anonymous_reviews: a negative helpful_count is clamped to 0 (never shown as negative)", () => {
  const app = normalizeZealotApp(
    rawApp({
      anonymous_reviews: [
        { rating: 4, body: "x", verified_install: false, version_code: null, helpful_count: -5, created_at: "2026-10-06T00:00:00Z" },
      ],
    }),
  );
  assert.equal(app.anonymous_reviews?.[0].helpful_count, 0);
});
