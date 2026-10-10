import assert from "node:assert/strict";
import test from "node:test";
import {
  dataSafetyRowsFor,
  deviceFits,
  formatAppSize,
  formatFactDate,
  infoRowsFor,
  minAndroidFor,
  statTilesFor,
  usableContentRating,
  usableLicense,
  type FactsApp,
} from "../lib/app-facts";
import type { App } from "../lib/mock-data";

/**
 * Pure helpers behind the details page's stat strip and Information list (operator-directed 2026-10-08, slice 2
 * of the details page rework). Written, not run (standing no-testing instruction).
 */

function firstParty(over: Partial<FactsApp> = {}): FactsApp {
  return {
    origin: "zealot",
    install_count: 0,
    avg_rating: 0,
    rating_count: 0,
    content_rating: "Everyone",
    size_mb: 12.34,
    version: "1.2.3",
    updated_at: "2026-10-08T23:59:00Z",
    min_android_version: "8.0",
    license: "MIT",
    ...over,
  };
}

function thirdParty(over: Partial<FactsApp> = {}): FactsApp {
  return firstParty({ origin: "aptoide", ...over });
}

const ids = (app: FactsApp) => statTilesFor(app).map((tile) => tile.id);

test("formatAppSize: MB, KB and GB, or null when the size is missing or not a positive number", () => {
  assert.equal(formatAppSize(12.34), "12.3 MB");
  assert.equal(formatAppSize(1), "1.0 MB");
  assert.equal(formatAppSize(0.5), "512 KB");
  assert.equal(formatAppSize(2048), "2.0 GB");
  assert.equal(formatAppSize(1023.99), "1.0 GB");
  assert.equal(formatAppSize(0), null);
  assert.equal(formatAppSize(-3), null);
  assert.equal(formatAppSize(Number.NaN), null);
  assert.equal(formatAppSize(null), null);
  assert.equal(formatAppSize(undefined), null);
});

test("formatFactDate is a full UTC date, or null", () => {
  assert.equal(formatFactDate("2026-10-08T23:59:00Z"), "Oct 8, 2026");
  assert.equal(formatFactDate("2026-01-01T00:00:00Z"), "Jan 1, 2026");
  assert.equal(formatFactDate(""), null);
  assert.equal(formatFactDate("not a date"), null);
  assert.equal(formatFactDate(null), null);
});

test("usable fields drop the flag, the empty string and the placeholder", () => {
  assert.equal(usableContentRating({ content_rating: "Teen" }), "Teen");
  assert.equal(usableContentRating({ content_rating: "Teen", not_provided: ["content_rating"] }), null);
  assert.equal(usableContentRating({ content_rating: "" as never }), null);
  assert.equal(usableLicense({ license: "GPL-3.0" }), "GPL-3.0");
  assert.equal(usableLicense({ license: "Not provided" }), null);
  assert.equal(usableLicense({ license: "  " }), null);
});

test("minAndroidFor writes a version number and an API level each in its own way", () => {
  assert.deepEqual(minAndroidFor({ min_android_version: "8.0" }), { short: "8.0+", long: "Android 8.0 and up" });
  assert.deepEqual(minAndroidFor({ min_android_version: "API 31" }), { short: "API 31+", long: "API 31 and up" });
  assert.equal(minAndroidFor({ min_android_version: "Not provided" }), null);
  assert.equal(minAndroidFor({ min_android_version: "8.0", not_provided: ["min_android_version"] }), null);
  assert.equal(minAndroidFor({ min_android_version: "" }), null);
});

test("a first-party app with history: downloads are the carried-over total, rating is the weighted average", () => {
  const app = firstParty({
    install_count: 120,
    avg_rating: 5,
    rating_count: 10,
    base_stats: { downloads: 5_789_000, rating: { average: 4, count: 30 } },
  });
  const tiles = statTilesFor(app);
  assert.deepEqual(
    tiles.map((tile) => tile.id),
    ["downloads", "rating", "age", "size", "version", "android"],
  );
  assert.equal(tiles[0].value, "5.8M");
  assert.deepEqual(tiles[0].counter, { target: 5_789_000, variant: "short", suffix: "" });
  assert.equal(tiles[1].value, "4.3"); // (4*30 + 5*10) / 40 = 4.25, rounded to one decimal by combinedRating
  assert.equal(tiles[1].label, "40 ratings");
  assert.deepEqual(tiles[1].rating, { average: 4.3 });
});

test("a first-party app without history uses this store's own count and rating", () => {
  const app = firstParty({ install_count: 1234, avg_rating: 4.6, rating_count: 1 });
  const [downloads, rating] = statTilesFor(app);
  assert.equal(downloads.value, "1,234+");
  assert.deepEqual(downloads.counter, { target: 1234, variant: "exact", suffix: "+" });
  assert.equal(rating.value, "4.6");
  assert.equal(rating.label, "1 rating");
});

test("zero downloads and zero ratings give no tile, never a zero placeholder", () => {
  assert.ok(!ids(firstParty()).includes("downloads"));
  assert.ok(!ids(firstParty()).includes("rating"));
  assert.ok(!ids(firstParty({ avg_rating: 4.5, rating_count: 0 })).includes("rating"));
  assert.ok(!ids(firstParty({ avg_rating: 0, rating_count: 5 })).includes("rating"));
  assert.ok(!ids(firstParty({ base_stats: { downloads: 0, rating: null } })).includes("downloads"));
});

test("a third-party app's figures come from the reported stats, as lower bounds, with no source wording", () => {
  const app = thirdParty({
    install_count: 99, // this store's own counters are never shown for a third-party app
    avg_rating: 1,
    rating_count: 1,
    third_party_stats: { downloads: 5_000_000, rating: { average: 4.3, total: 1200, votes: null } },
  });
  const [downloads, rating] = statTilesFor(app);
  assert.equal(downloads.value, "5M+");
  assert.deepEqual(downloads.counter, { target: 5_000_000, variant: "reported", suffix: "" });
  assert.equal(rating.value, "4.3");
  assert.equal(rating.label, "1,200 ratings");
  for (const tile of statTilesFor(app)) {
    assert.ok(!/aptoide|third.?party|reported/i.test(`${tile.value} ${tile.label} ${tile.note ?? ""}`), tile.id);
  }
});

test("a third-party app with no reported figures gets no downloads or rating tile", () => {
  assert.deepEqual(ids(thirdParty()), ["age", "size", "version", "android"]);
  assert.deepEqual(ids(thirdParty({ third_party_stats: { downloads: null, rating: null } })), ["age", "size", "version", "android"]);
  assert.deepEqual(
    ids(thirdParty({ third_party_stats: { downloads: 0, rating: { average: 0, total: 0, votes: null } } })),
    ["age", "size", "version", "android"],
  );
});

test("a first-party app's own counters are used even if a stray third-party block is present", () => {
  const app = firstParty({ third_party_stats: { downloads: 9_000_000, rating: { average: 5, total: 99, votes: null } } });
  assert.deepEqual(ids(app), ["age", "size", "version", "android"]);
});

test("the version tile carries the updated month; fields the source did not provide give no tile", () => {
  const tiles = statTilesFor(firstParty());
  const version = tiles.find((tile) => tile.id === "version");
  assert.equal(version?.value, "1.2.3");
  assert.equal(version?.note, "Updated Oct 2026");
  assert.equal(tiles.find((tile) => tile.id === "age")?.value, "Everyone");
  assert.equal(tiles.find((tile) => tile.id === "size")?.value, "12.3 MB");
  assert.equal(tiles.find((tile) => tile.id === "android")?.value, "8.0+");

  const bare = firstParty({
    not_provided: ["content_rating", "min_android_version"],
    size_mb: 0,
    version: "",
    updated_at: "",
  });
  assert.deepEqual(statTilesFor(bare), []);

  const noDate = statTilesFor(firstParty({ updated_at: "nonsense" })).find((tile) => tile.id === "version");
  assert.equal(noDate?.note, undefined);
});

test("no tile ever says Not provided", () => {
  const app = firstParty({ license: "Not provided", min_android_version: "Not provided", version: "Not provided" });
  for (const tile of statTilesFor(app)) assert.ok(!/not provided/i.test(`${tile.value} ${tile.label} ${tile.note ?? ""}`));
});

const context = { developer: { slug: "acme", name: "Acme Ltd" }, developerName: "Acme Ltd", categoryName: "Tools" };

test("the Information list has the fields in order, with the developer as a link", () => {
  const rows = infoRowsFor(firstParty(), context);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["developer", "category", "size", "version", "updated", "android", "license", "content_rating"],
  );
  assert.deepEqual(rows[0], { id: "developer", label: "Developer", value: "Acme Ltd", href: "/developer/acme" });
  assert.equal(rows.find((row) => row.id === "updated")?.value, "Oct 8, 2026");
  assert.equal(rows.find((row) => row.id === "android")?.value, "Android 8.0 and up");
  assert.equal(rows.find((row) => row.id === "license")?.value, "MIT");
  assert.equal(rows.find((row) => row.id === "content_rating")?.value, "Everyone");
});

test("the Information list omits what the source did not provide and never prints a placeholder", () => {
  const rows = infoRowsFor(
    firstParty({ license: "Not provided", not_provided: ["content_rating", "min_android_version"], size_mb: 0, updated_at: "" }),
    { developer: null, developerName: null, categoryName: null },
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ["version"],
  );
  for (const row of rows) assert.ok(!/not provided/i.test(`${row.label} ${row.value}`));
});

test("a developer without a page is plain text, not a link to a 404", () => {
  const rows = infoRowsFor(thirdParty(), { developer: null, developerName: "Some Publisher", categoryName: null });
  assert.deepEqual(rows[0], { id: "developer", label: "Developer", value: "Some Publisher" });
  assert.equal("href" in rows[0], false);
});

// Card D-P5 — the Data Safety panel rows.

const safetyApp = (over: Partial<App["data_safety"]> = {}) => ({
  data_safety: {
    collects_data: true,
    data_types: [],
    shared_with_third_parties: false,
    data_encrypted_in_transit: true,
    can_request_data_deletion: true,
    ...over,
  },
});

test("dataSafetyRowsFor: renders each answer, including an honest No", () => {
  const rows = dataSafetyRowsFor(safetyApp({ collects_data: false, data_encrypted_in_transit: false }));
  assert.deepEqual(rows, [
    { question: "Data collected", answer: "No" },
    { question: "Shared with third parties", answer: "No" },
    { question: "Data encrypted in transit", answer: "No" },
    { question: "You can request data deletion", answer: "Yes" },
  ]);
});

test("dataSafetyRowsFor: lists data types only when data is collected, capped with a remainder", () => {
  const rows = dataSafetyRowsFor(safetyApp({ collects_data: true, data_types: ["Location", "Photos"] }));
  assert.deepEqual(rows[1], { question: "Data types", answer: "Location, Photos" });

  const many = dataSafetyRowsFor(
    safetyApp({ collects_data: true, data_types: ["a", "b", "c", "d", "e", "f", "g", "h"] }),
  );
  assert.deepEqual(many[1], { question: "Data types", answer: "a, b, c, d, e, f, and 2 more" });

  const none = dataSafetyRowsFor(safetyApp({ collects_data: false, data_types: ["Location"] }));
  assert.ok(!none.some((r) => r.question === "Data types"));
});

test("dataSafetyRowsFor: an unprovided section yields no rows (no invented panel)", () => {
  assert.deepEqual(dataSafetyRowsFor(safetyApp({ provided: false })), []);
});

// Card S-P2 (web reader) — "works on your device".

test("deviceFits: unknown when the app published nothing, never a false yes", () => {
  assert.equal(deviceFits({}, { apiLevel: 34, abi: "arm64-v8a" }), "unknown");
  assert.equal(deviceFits({ device_compat: null }, { apiLevel: 34, abi: null }), "unknown");
});

test("deviceFits: a published min_sdk decides yes or no against the device API level", () => {
  assert.equal(deviceFits({ device_compat: { min_sdk: 23 } }, { apiLevel: 34, abi: null }), "yes");
  assert.equal(deviceFits({ device_compat: { min_sdk: 34 } }, { apiLevel: 23, abi: null }), "no");
  // The device not saying its API level is unknown, not a guess.
  assert.equal(deviceFits({ device_compat: { min_sdk: 23 } }, { apiLevel: null, abi: null }), "unknown");
});

test("deviceFits: a published ABI list decides yes or no against the device ABI", () => {
  assert.equal(deviceFits({ device_compat: { abis: ["arm64-v8a", "armeabi-v7a"] } }, { apiLevel: null, abi: "arm64-v8a" }), "yes");
  assert.equal(deviceFits({ device_compat: { abis: ["arm64-v8a"] } }, { apiLevel: null, abi: "x86_64" }), "no");
  // The device not saying its ABI leaves only the part it did say.
  assert.equal(deviceFits({ device_compat: { abis: ["arm64-v8a"] } }, { apiLevel: null, abi: null }), "yes");
});

test("deviceFits: any failed constraint is a no, even when another passes", () => {
  const app = { device_compat: { min_sdk: 23, abis: ["arm64-v8a"] } };
  assert.equal(deviceFits(app, { apiLevel: 34, abi: "x86_64" }), "no");
  assert.equal(deviceFits(app, { apiLevel: 21, abi: "arm64-v8a" }), "no");
  assert.equal(deviceFits(app, { apiLevel: 34, abi: "arm64-v8a" }), "yes");
});
