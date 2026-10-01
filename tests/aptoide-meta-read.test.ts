import { test } from "node:test";
import assert from "node:assert/strict";
import { readMetaResponse } from "../lib/aptoide-crawl";

const app = { package: "com.example.app", file: { malware: { rank: "TRUSTED" } } };

test("getMeta shape: app in top-level data", () => {
  const r = readMetaResponse({ info: { status: "OK" }, data: app }, "{}");
  assert.equal(r.kind, "app");
});

test("app/get shape: app in nodes.meta.data", () => {
  const r = readMetaResponse({ nodes: { meta: { data: app } } }, "{}");
  assert.equal(r.kind, "app");
});

test("info.status FAIL is not_found, not unreadable", () => {
  assert.equal(readMetaResponse({ info: { status: "fail" } }, "{}").kind, "not_found");
});

test("a 200 body with no app is unreadable and carries a collapsed 300-char sample", () => {
  const body = `{"foo":\n   "${"x".repeat(500)}"}`;
  const r = readMetaResponse({ foo: "bar" }, body);
  assert.equal(r.kind, "unreadable");
  if (r.kind === "unreadable") {
    assert.equal(r.sample.length, 300);
    assert.ok(!r.sample.includes("\n"));
  }
});

test("data without a package is not an app; non-objects are unreadable", () => {
  assert.equal(readMetaResponse({ data: { name: "x" } }, "{}").kind, "unreadable");
  assert.equal(readMetaResponse(null, "null").kind, "unreadable");
  assert.equal(readMetaResponse([app], "[]").kind, "unreadable");
});
