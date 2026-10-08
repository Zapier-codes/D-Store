import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * Source-text guards for the details page header (operator-directed 2026-10-08, slice 1 of the details page
 * rework). The sandbox that wrote it could not render the page, so these pin the contracts other code and the
 * brief depend on, the way tests/glass-layer.test.ts does for the shared layer.
 */

const header = readFileSync("components/AppHeader.tsx", "utf8");
const css = readFileSync("components/AppHeader.module.css", "utf8");
const page = readFileSync("app/app/[slug]/page.tsx", "utf8");

test("the install row keeps the id the sticky bar watches, and the page passes the same id to it", () => {
  assert.match(header, /id="primary-install-row"/);
  assert.match(page, /watchTargetId="primary-install-row"/);
});

test("the header has the page's one h1, through the shared name component", () => {
  assert.match(header, /<AppNameTitle as="h1"/);
  assert.ok(!/<h1/.test(header));
});

test("the install button keeps every prop it had on the page", () => {
  for (const prop of ["appSlug={app.slug}", "appName={app.name}", "currentVersion={app.version}", "releaseId={app.release_id}", "rolloutPercentage={app.rollout_percentage}", "packageName={app.package_name}"]) {
    assert.ok(header.includes(prop), prop);
  }
  assert.match(header, /apkUrl=\{app\.version_status === "pulled" \? "" : app\.apk\}/);
});

test("the version advisory comes before the install row", () => {
  assert.ok(header.indexOf("<VersionAdvisory") > 0);
  assert.ok(header.indexOf("<VersionAdvisory") < header.indexOf('id="primary-install-row"'));
});

test("nothing the source did not provide is printed, and no source or third-party wording", () => {
  const code = header.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/not provided/i.test(code));
  assert.ok(!/aptoide|third-party|third party/i.test(code.replace(/isThirdParty|thirdParty|ThirdPartyDownloadButton/g, "")));
});

test("the header uses the shared accent scope and glass panel", () => {
  assert.match(css, /\.root\s*\{\s*composes:\s*scope from "\.\/glass\/glass\.module\.css"/);
  assert.match(css, /\.panel\s*\{\s*composes:\s*panel from "\.\/glass\/glass\.module\.css"/);
});

test("the old header rules are gone from the page stylesheet and the page no longer builds its own header", () => {
  const pageCss = readFileSync("app/app/[slug]/page.module.css", "utf8");
  for (const gone of [/^\.header\b/m, /^\.headerText\b/m, /^\.icon\b/m, /^\.installRow\b/m, /^\.stats\b/m, /^\.badge\b/m]) assert.ok(!gone.test(pageCss), String(gone));
  assert.ok(!/<h1/.test(page));
  assert.match(page, /<AppHeader/);
});

test("the header's text never uses the hairline border colour or the decorative accent", () => {
  assert.ok(!/color:\s*var\(--color-border/.test(css));
  assert.ok(!/color:\s*#38bdf8/i.test(css));
});
