import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_SLUGS, validateSlugs } from "../lib/push-validate";
import { decodeVapidPublicKey, getPushSupport, getVapidPublicKey, selectSlugs } from "../lib/push-support";

// Leaf 5.d.iv.zi.
const KEY = Buffer.from([0x04, ...Array.from({ length: 64 }, (_, i) => i + 1)]).toString("base64url");

test("decodeVapidPublicKey: a 65-byte uncompressed point decodes to 65 bytes", () => {
  const result = decodeVapidPublicKey(KEY);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.length, 65);
    assert.equal(result.value[0], 0x04);
  }
});

test("decodeVapidPublicKey: refuses wrong length, padding, wrong first byte and non-strings", () => {
  assert.equal(decodeVapidPublicKey(KEY.slice(0, 86)).ok, false);
  assert.equal(decodeVapidPublicKey(KEY + "=").ok, false);
  const wrongFirstByte = Buffer.from([0x03, ...Array.from({ length: 64 }, () => 1)]).toString("base64url");
  assert.equal(decodeVapidPublicKey(wrongFirstByte).ok, false);
  for (const input of [undefined, null, 5, {}, []]) assert.equal(decodeVapidPublicKey(input).ok, false);
});

test("getVapidPublicKey: unset or malformed behaves like no key; whitespace is trimmed", () => {
  assert.equal(getVapidPublicKey(null), null);
  assert.equal(getVapidPublicKey(""), null);
  assert.equal(getVapidPublicKey("not a key"), null);
  assert.equal(getVapidPublicKey(5), null);
  assert.equal(getVapidPublicKey(`  ${KEY}\n`)?.length, 65);
});

test("getPushSupport: empty or hostile environments are unsupported and never throw", () => {
  assert.equal(getPushSupport({}), "unsupported");
  assert.equal(getPushSupport({ navigator: null }), "unsupported");
  assert.equal(getPushSupport({ navigator: "x", window: 5 }), "unsupported");
  assert.equal(getPushSupport(undefined as never), "unsupported");
});

test("getPushSupport: needs serviceWorker, PushManager and Notification", () => {
  const nav = { serviceWorker: {} };
  const win = { PushManager: {}, Notification: {} };
  assert.equal(getPushSupport({ navigator: nav, window: win }), "supported");
  assert.equal(getPushSupport({ navigator: {}, window: win }), "unsupported");
  assert.equal(getPushSupport({ navigator: nav, window: { Notification: {} } }), "unsupported");
});

test("getPushSupport: an iPhone outside the home screen needs it, even before checking the API; installed it is judged normally", () => {
  const iphone = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", serviceWorker: {} };
  const win = { PushManager: {}, Notification: {} };
  assert.equal(getPushSupport({ navigator: iphone, window: {} }), "needs_home_screen");
  assert.equal(getPushSupport({ navigator: { ...iphone, standalone: true }, window: win }), "supported");
  assert.equal(
    getPushSupport({ navigator: iphone, window: win, matchMedia: () => ({ matches: true }) }),
    "supported",
  );
});

test("selectSlugs: newest first, de-duplicated, invalid entries skipped and counted", () => {
  const result = selectSlugs([
    { slug: "old", addedAt: "2026-01-01T00:00:00Z" },
    { slug: "new", addedAt: "2026-03-01T00:00:00Z" },
    { slug: "Bad Slug", addedAt: "2026-04-01T00:00:00Z" },
    { slug: "new", addedAt: "2026-02-01T00:00:00Z" },
    null,
    5,
  ]);
  assert.deepEqual(result, { slugs: ["new", "old"], truncated: false, skipped: 3 });
});

test("selectSlugs: caps at the server's limit (dropping the oldest), never raises the cap, and always passes validateSlugs", () => {
  const many = Array.from({ length: MAX_SLUGS + 20 }, (_, i) => ({
    slug: `app-${i}`,
    addedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
  }));
  const result = selectSlugs(many);
  assert.equal(result.slugs.length, MAX_SLUGS);
  assert.equal(result.truncated, true);
  assert.equal(result.slugs[0], `app-${MAX_SLUGS + 19}`); // newest first
  assert.equal(validateSlugs(result.slugs).ok, true);
  assert.equal(selectSlugs(many, 5).slugs.length, 5);
  assert.equal(selectSlugs(many, 100000).slugs.length, MAX_SLUGS);
});

test("selectSlugs: a non-array is empty and never throws", () => {
  for (const input of [undefined, null, 5, "x", {}]) {
    assert.deepEqual(selectSlugs(input), { slugs: [], truncated: false, skipped: 0 });
  }
});
