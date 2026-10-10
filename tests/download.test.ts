import { test } from "node:test";
import assert from "node:assert/strict";
import { appDownloadUrl, isHttpsUrl } from "../lib/download";

// Operator-directed 2026-10-10: a website can only download and share, so the details page's one
// control is a real download link. These pin the URL rules that decide what that link points at.

test("isHttpsUrl accepts only absolute https URLs", () => {
  for (const ok of ["https://example.invalid/a.apk", "https://fdroid.org/x/y.apk"]) assert.equal(isHttpsUrl(ok), true, ok);
  for (const bad of ["", "http://insecure.example/a.apk", "javascript:alert(1)", "/api/apps/x/download", "ftp://x/a.apk", undefined, null, 5, {}]) {
    assert.equal(isHttpsUrl(bad), false, String(bad));
  }
});

test("a first-party app uses this store's own door", () => {
  assert.equal(appDownloadUrl({ slug: "appstore", apk: "https://cdn.invalid/appstore.apk" }), "/api/apps/appstore/download");
});

test("the slug is encoded in the door path", () => {
  assert.equal(appDownloadUrl({ slug: "a b/c", apk: "x" }), "/api/apps/a%20b%2Fc/download");
});

test("a pulled first-party release has nothing to link to", () => {
  assert.equal(appDownloadUrl({ slug: "appstore", apk: "https://cdn.invalid/a.apk", version_status: "pulled" }), "");
});

test("a third-party app links to its own source when the URL is https", () => {
  assert.equal(
    appDownloadUrl({ slug: "fdroid", apk: "https://f-droid.org/repo/x.apk", third_party: true }),
    "https://f-droid.org/repo/x.apk",
  );
});

test("a third-party app with no usable https source has nothing to link to", () => {
  assert.equal(appDownloadUrl({ slug: "fdroid", apk: "", third_party: true }), "");
  assert.equal(appDownloadUrl({ slug: "fdroid", apk: "http://insecure.example/x.apk", third_party: true }), "");
  assert.equal(appDownloadUrl({ slug: "fdroid", apk: "/relative/x.apk", third_party: true }), "");
});

test("a missing slug is never a link", () => {
  assert.equal(appDownloadUrl({ slug: "", apk: "https://x/y.apk" }), "");
});
