import { test } from "node:test";
import assert from "node:assert/strict";
import { PAYLOAD_NAME_MAX, PAYLOAD_VERSION_MAX, PUSH_TOPIC_LENGTH, buildPayload, topicForSlug } from "../lib/push-fanout";

// Leaf 5.d.iv.zi. Only the two small pure helpers with a documented contract; the fan-out itself is not covered here.

test("topicForSlug: 32 URL-safe characters, the same every time, different per slug", () => {
  const a = topicForSlug("firefox");
  assert.ok(a !== null);
  assert.equal(a.length, PUSH_TOPIC_LENGTH);
  assert.match(a, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(topicForSlug("firefox"), a);
  assert.notEqual(topicForSlug("vlc"), a);
});

test("topicForSlug: anything that is not a valid catalog slug is null and never throws", () => {
  for (const input of ["Bad Slug", "UPPER", "", "-a", 5, null, undefined, {}, [], Symbol("x")]) {
    assert.equal(topicForSlug(input), null);
  }
});

test("buildPayload: exactly { slug, name, version } as JSON", () => {
  const parsed = JSON.parse(buildPayload("firefox", "Firefox", "1.2.3"));
  assert.deepEqual(parsed, { slug: "firefox", name: "Firefox", version: "1.2.3" });
  assert.deepEqual(Object.keys(parsed), ["slug", "name", "version"]);
});

test("buildPayload: cuts name and version to their caps by code point, never inside a surrogate pair", () => {
  const parsed = JSON.parse(buildPayload("a", "x".repeat(500), "v".repeat(500)));
  assert.equal(parsed.name.length, PAYLOAD_NAME_MAX);
  assert.equal(parsed.version.length, PAYLOAD_VERSION_MAX);

  const emoji = JSON.parse(buildPayload("a", "\u{1F600}".repeat(200), "1"));
  assert.equal(Array.from(emoji.name as string).length, PAYLOAD_NAME_MAX);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(emoji.name)); // no lone high surrogate
});
