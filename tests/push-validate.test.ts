import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SLUGS,
  decodeBase64Url,
  validateAuth,
  validateEndpoint,
  validateP256dh,
  validatePushSubscription,
  validateSlugs,
} from "../lib/push-validate";

// Leaf 5.d.iv.zi. Real-shaped keys: a 65-byte uncompressed point (first byte 0x04) and a 16-byte secret,
// both unpadded base64url, exactly what PushSubscription.toJSON() produces.
const P256DH = Buffer.from([0x04, ...Array.from({ length: 64 }, (_, i) => i + 1)]).toString("base64url");
const AUTH = Buffer.from(Array.from({ length: 16 }, (_, i) => i + 1)).toString("base64url");
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";

// `[]` is deliberately absent: an empty array is a valid (empty) slug list.
const HOSTILE: unknown[] = [undefined, null, NaN, -1, 0, true, {}, () => 1, Symbol("x"), BigInt(10)];

test("the fixtures have the lengths the validators expect", () => {
  assert.equal(P256DH.length, 87);
  assert.equal(AUTH.length, 22);
});

test("decodeBase64Url: decodes canonical unpadded base64url", () => {
  assert.deepEqual([...(decodeBase64Url("AA") as Uint8Array)], [0]);
  assert.deepEqual([...(decodeBase64Url("_-8") as Uint8Array)], [0xff, 0xef]);
});

test("decodeBase64Url: refuses padding, the standard alphabet, empty, impossible length and non-canonical bits", () => {
  assert.equal(decodeBase64Url("AA=="), null);
  assert.equal(decodeBase64Url("+/8"), null);
  assert.equal(decodeBase64Url(""), null);
  assert.equal(decodeBase64Url("A"), null);
  assert.equal(decodeBase64Url("AB"), null); // trailing bits are not zero
});

test("validateEndpoint: accepts a public https push service, returned exactly as received", () => {
  const result = validateEndpoint(ENDPOINT);
  assert.deepEqual(result, { ok: true, value: ENDPOINT });
});

test("validateEndpoint: refuses every non-public or malformed shape", () => {
  const bad = [
    "http://fcm.googleapis.com/x",
    "HTTPS://fcm.googleapis.com/x",
    "https://127.0.0.1/x",
    "https://2130706433/x",
    "https://[::1]/x",
    "https://localhost/x",
    "https://printer.local/x",
    "https://service.internal/x",
    "https://singlelabel/x",
    "https://push.example.com:8443/x",
    "https://user:pass@push.example.com/x",
    "https://push.example.com/x#frag",
    "https://push.example.com/a b",
    "https://push.example.com/\u0000",
    "https://",
    "",
    "https://" + "a".repeat(2100) + ".com/x",
  ];
  for (const input of bad) assert.equal(validateEndpoint(input).ok, false, JSON.stringify(input.slice(0, 60)));
});

test("validateEndpoint, validateP256dh, validateAuth, validatePushSubscription and validateSlugs never throw on hostile input", () => {
  for (const input of HOSTILE) {
    assert.equal(validateEndpoint(input).ok, false);
    assert.equal(validateP256dh(input).ok, false);
    assert.equal(validateAuth(input).ok, false);
    assert.equal(validatePushSubscription(input).ok, false);
    assert.equal(validateSlugs(input).ok, false);
  }
});

test("validateP256dh: needs 65 bytes starting 0x04", () => {
  assert.deepEqual(validateP256dh(P256DH), { ok: true, value: P256DH });
  const notUncompressed = Buffer.from([0x03, ...Array.from({ length: 64 }, () => 1)]).toString("base64url");
  assert.equal(validateP256dh(notUncompressed).ok, false);
  assert.equal(validateP256dh(P256DH.slice(0, 86)).ok, false);
  assert.equal(validateP256dh(P256DH + "=").ok, false);
});

test("validateAuth: needs 16 bytes", () => {
  assert.deepEqual(validateAuth(AUTH), { ok: true, value: AUTH });
  assert.equal(validateAuth(AUTH.slice(0, 21)).ok, false);
  assert.equal(validateAuth(AUTH + "A").ok, false);
});

test("validatePushSubscription: accepts a whole subscription and rejects each missing part", () => {
  const good = { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } };
  assert.deepEqual(validatePushSubscription(good), {
    ok: true,
    value: { endpoint: ENDPOINT, p256dh: P256DH, auth: AUTH },
  });
  assert.equal(validatePushSubscription({ keys: good.keys }).ok, false);
  assert.equal(validatePushSubscription({ endpoint: ENDPOINT }).ok, false);
  assert.equal(validatePushSubscription({ endpoint: ENDPOINT, keys: { auth: AUTH } }).ok, false);
  assert.equal(validatePushSubscription({ endpoint: ENDPOINT, keys: { p256dh: P256DH } }).ok, false);
  assert.equal(validatePushSubscription([good]).ok, false);
});

test("validateSlugs: de-duplicates in first-seen order", () => {
  assert.deepEqual(validateSlugs(["firefox", "vlc", "firefox", "a-b-c"]), { ok: true, value: ["firefox", "vlc", "a-b-c"] });
  assert.deepEqual(validateSlugs([]), { ok: true, value: [] });
});

test("validateSlugs: refuses a bad slug, a non-string entry and an over-long list (never truncates)", () => {
  assert.equal(validateSlugs(["Firefox"]).ok, false);
  assert.equal(validateSlugs(["-a"]).ok, false);
  assert.equal(validateSlugs(["a--b"]).ok, false);
  assert.equal(validateSlugs([""]).ok, false);
  assert.equal(validateSlugs(["ok", 5]).ok, false);
  assert.equal(validateSlugs(["a".repeat(101)]).ok, false);
  const tooMany = Array.from({ length: MAX_SLUGS + 1 }, (_, i) => `app-${i}`);
  assert.equal(validateSlugs(tooMany).ok, false);
  assert.equal(validateSlugs(tooMany.slice(0, MAX_SLUGS)).ok, true);
});
