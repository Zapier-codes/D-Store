import test from "node:test";
import assert from "node:assert/strict";
import { freshnessQuery, ZEALOT_INDEX_TTL_MS } from "../lib/sources/zealot";
import { readFileSync } from "node:fs";

// Task 49 (written, not run): the Zealot index is read through a cache-busted URL so GitHub's CDN
// cannot hold an update back for its own five minutes.

test("the default refresh window is 30 seconds", () => {
  if (process.env.ZEALOT_INDEX_TTL_MS === undefined) assert.equal(ZEALOT_INDEX_TTL_MS, 30_000);
});

test("freshnessQuery is the same for every call inside one window", () => {
  const start = 1_000 * 30_000; // a window boundary
  assert.equal(freshnessQuery(start, 30_000), freshnessQuery(start + 29_999, 30_000));
});

test("freshnessQuery changes when the next window starts", () => {
  const start = 1_000 * 30_000;
  assert.notEqual(freshnessQuery(start, 30_000), freshnessQuery(start + 30_000, 30_000));
});

test("freshnessQuery is a plain query string the host can ignore", () => {
  assert.match(freshnessQuery(1_700_000_000_000, 30_000), /^\?v=\d+$/);
});

test("the index and its signature are fetched with the same window value", () => {
  const source = readFileSync("lib/sources/zealot.ts", "utf-8");
  assert.match(source, /const query = freshnessQuery\(\);/);
  assert.match(source, /fetch\(`\$\{base\}\/index\.json\$\{query\}`/);
  assert.match(source, /fetch\(`\$\{base\}\/index\.json\.sig\$\{query\}`/);
});

test("the public catalog answer is cached for 30 seconds, not five minutes", () => {
  const source = readFileSync("lib/catalog-api.ts", "utf-8");
  assert.match(source, /s-maxage=30,/);
  assert.doesNotMatch(source, /s-maxage=300/);
});
