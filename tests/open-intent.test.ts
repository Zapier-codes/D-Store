import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOpenIntentUrl,
  buildUninstallIntentUrl,
  isUninstallUnavailable,
  uninstallFallbackUrl,
  isAndroidUserAgent,
  isReinstallRequest,
  isValidPackageName,
  reinstallFallbackUrl,
} from "../lib/open-intent";

test("isValidPackageName accepts application ids and refuses anything that could break the URL", () => {
  for (const ok of ["com.vythera.vyxelapps", "org.fdroid.fdroid", "a.b", "com.example.app_2"]) assert.equal(isValidPackageName(ok), true, ok);
  for (const bad of ["", "nodots", "com..x", "com.x;end", "com.x/../y", "1com.x", "com.x y", "com.x#Intent", undefined, null, 5]) {
    assert.equal(isValidPackageName(bad), false, String(bad));
  }
});

test("reinstallFallbackUrl points at the app's own page with the flag, https only", () => {
  assert.equal(reinstallFallbackUrl("https://d-store-nu.vercel.app", "appstore"), "https://d-store-nu.vercel.app/app/appstore?reinstall=1");
  assert.equal(reinstallFallbackUrl("http://d-store-nu.vercel.app", "appstore"), null);
  assert.equal(reinstallFallbackUrl("not a url", "appstore"), null);
  assert.equal(reinstallFallbackUrl("https://x.app", "a/b"), null);
  assert.equal(reinstallFallbackUrl("https://x.app", ""), null);
});

test("buildOpenIntentUrl builds the intent with an encoded https fallback, else null", () => {
  const fb = "https://d-store-nu.vercel.app/app/appstore?reinstall=1";
  assert.equal(
    buildOpenIntentUrl("com.vythera.vyxelapps", fb),
    `intent:#Intent;package=com.vythera.vyxelapps;S.browser_fallback_url=${encodeURIComponent(fb)};end`
  );
  assert.equal(buildOpenIntentUrl("bad;pkg", fb), null);
  assert.equal(buildOpenIntentUrl("com.x.y", null), null);
  assert.equal(buildOpenIntentUrl("com.x.y", "javascript:alert(1)"), null);
  assert.equal(buildOpenIntentUrl("com.x.y", "http://insecure.example/"), null);
  // the fallback cannot close the intent early: its ';' and '=' are percent-encoded
  const url = buildOpenIntentUrl("com.x.y", "https://e.app/a?x=1;end")!;
  assert.equal(url.split(";").length, 4);
});

test("isReinstallRequest reads only reinstall=1", () => {
  assert.equal(isReinstallRequest("?reinstall=1"), true);
  assert.equal(isReinstallRequest("?a=1&reinstall=1"), true);
  assert.equal(isReinstallRequest("?reinstall=0"), false);
  assert.equal(isReinstallRequest(""), false);
});

test("isAndroidUserAgent", () => {
  assert.equal(isAndroidUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126"), true);
  assert.equal(isAndroidUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari"), false);
  assert.equal(isAndroidUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"), false);
});

test("uninstall link goes to the store app's scheme with an encoded https fallback, else null", () => {
  const fb = uninstallFallbackUrl("https://d-store-nu.vercel.app", "appstore")!;
  assert.equal(fb, "https://d-store-nu.vercel.app/app/appstore?uninstall=unavailable");
  assert.equal(
    buildUninstallIntentUrl("com.vythera.vyxelapps", fb),
    `intent://uninstall/com.vythera.vyxelapps#Intent;scheme=vyxelapps;S.browser_fallback_url=${encodeURIComponent(fb)};end`
  );
  assert.equal(buildUninstallIntentUrl("bad;pkg", fb), null);
  assert.equal(buildUninstallIntentUrl("com.x.y", null), null);
  assert.equal(buildUninstallIntentUrl("com.x.y", "http://insecure.example/"), null);
  assert.equal(uninstallFallbackUrl("http://insecure.example", "appstore"), null);
  assert.equal(isUninstallUnavailable("?uninstall=unavailable"), true);
  assert.equal(isUninstallUnavailable("?uninstall=1"), false);
  assert.equal(isUninstallUnavailable(""), false);
});
