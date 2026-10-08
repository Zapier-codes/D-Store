import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  ABOUT_COLLAPSE_THRESHOLD,
  canCollapseDescription,
  descriptionBlocks,
  usableDescription,
  whatsNewFor,
} from "../lib/about-text";

/**
 * About, What's New, Permissions chips and the Report footer (operator-directed 2026-10-08, slice 5 of the details
 * page rework). The first half tests the pure helpers; the second half pins source-text contracts, the way
 * tests/stat-strip.test.ts does, because the sandbox that wrote them could not render the page. Written, not run.
 */

const about = readFileSync("components/ExpandableDescription.tsx", "utf8");
const aboutCss = readFileSync("components/ExpandableDescription.module.css", "utf8");
const changelog = readFileSync("components/Changelog.tsx", "utf8");
const changelogCss = readFileSync("components/Changelog.module.css", "utf8");
const perms = readFileSync("components/PermissionsDisclosure.tsx", "utf8");
const permsCss = readFileSync("components/PermissionsDisclosure.module.css", "utf8");
const report = readFileSync("components/ReportProblem.tsx", "utf8");
const reportCss = readFileSync("components/ReportProblem.module.css", "utf8");
const formCss = readFileSync("components/ReportAppForm.module.css", "utf8");
const page = readFileSync("app/app/[slug]/page.tsx", "utf8");

const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("usableDescription treats empty text and the Not provided placeholder as missing", () => {
  assert.equal(usableDescription("  "), null);
  assert.equal(usableDescription(""), null);
  assert.equal(usableDescription("Not provided"), null);
  assert.equal(usableDescription("not provided "), null);
  assert.equal(usableDescription(undefined), null);
  assert.equal(usableDescription("A good app."), "A good app.");
});

test("a short description does not collapse, a long one does", () => {
  assert.equal(canCollapseDescription("x".repeat(ABOUT_COLLAPSE_THRESHOLD)), false);
  assert.equal(canCollapseDescription("x".repeat(ABOUT_COLLAPSE_THRESHOLD + 1)), true);
});

test("descriptionBlocks keeps paragraphs and turns all-dash blocks into lists", () => {
  const blocks = descriptionBlocks("First paragraph.\n\n- one\n- two\n\nLast one.");
  assert.deepEqual(blocks, [
    { kind: "paragraph", text: "First paragraph." },
    { kind: "list", items: ["one", "two"] },
    { kind: "paragraph", text: "Last one." },
  ]);
});

test("whatsNewFor returns null without notes, and only the pieces the app has otherwise", () => {
  assert.equal(whatsNewFor({ changelog: "", version: "1.0", updated_at: "2026-10-01T00:00:00Z" }), null);
  assert.equal(whatsNewFor({ changelog: "Not provided", version: "1.0", updated_at: "2026-10-01T00:00:00Z" }), null);
  const full = whatsNewFor({ changelog: "Fixes.", version: "1.2.3", updated_at: "2026-10-01T00:00:00Z" });
  assert.deepEqual(full, { version: "1.2.3", date: "Oct 1, 2026", notes: "Fixes." });
  const bare = whatsNewFor({ changelog: "Fixes.", version: "", updated_at: "not a date" });
  assert.deepEqual(bare, { version: null, date: null, notes: "Fixes." });
});

test("About, What's New and Permissions each own their section and render nothing without content", () => {
  assert.match(about, /aria-labelledby=\{headingId\}/);
  assert.match(about, /About this app/);
  assert.match(about, /if \(!text\) return null/);
  assert.match(changelog, /if \(!news\) return null/);
  assert.match(perms, /if \(notProvided\) return null/);
  assert.match(perms, /id="permissions-heading"/);
  assert.ok(!/id="description-heading"|id="report-heading"/.test(page), "the page no longer wraps these sections itself");
  assert.ok(!/id="permissions-heading"/.test(page));
});

test("the About text fades with a mask on the text, has a glass Read more pill, and no fade in forced colours", () => {
  assert.match(aboutCss, /composes:\s*scope from "\.\/glass\/glass\.module\.css"/);
  assert.match(aboutCss, /composes:\s*panel from "\.\/glass\/glass\.module\.css"/);
  assert.match(aboutCss, /composes:\s*pill from "\.\/glass\/glass\.module\.css"/);
  assert.match(aboutCss, /mask-image:\s*linear-gradient/);
  assert.match(aboutCss, /@media \(forced-colors: active\)[\s\S]*mask-image:\s*none/);
  assert.match(about, /aria-expanded=\{expanded\}/);
  assert.match(about, /Read more/);
  assert.ok(!/backdrop-filter|@keyframes|animation:/.test(code(aboutCss)), "blur comes from the shared layer only; nothing loops");
});

test("What's New stays a dropdown, drawn as a glass card with version and date pills", () => {
  assert.match(changelog, /aria-expanded=\{open\}/);
  assert.match(changelog, /GlassPill/);
  assert.match(changelog, /Version \{news\.version\}/);
  assert.match(changelog, /Updated \{news\.date\}/);
  assert.match(changelogCss, /composes:\s*panel from "\.\/glass\/glass\.module\.css"/);
  assert.match(changelogCss, /composes:\s*scope from "\.\/glass\/glass\.module\.css"/);
  assert.match(changelogCss, /prefers-reduced-motion: reduce/);
  assert.match(changelogCss, /visibility:\s*hidden/);
});

test("Permissions are grouped chips with icons, keep the raw names under a native fold, and wrap long names", () => {
  assert.match(perms, /groupPermissions/);
  assert.match(perms, /PermissionIcon/);
  assert.match(perms, /<details/);
  assert.match(perms, /Technical names/);
  assert.match(permsCss, /overflow-wrap:\s*anywhere/);
  assert.ok(!/backdrop-filter/.test(permsCss), "the chips take their blur from the shared pill");
  assert.ok(!/Not provided/.test(code(perms)), "no Not provided text");
});

test("the Report action is a quiet footer toggle that expands the existing form in place, last on the page", () => {
  assert.match(report, /aria-expanded=\{open\}/);
  assert.match(report, /aria-controls=\{panelId\}/);
  assert.match(report, /<ReportAppForm appSlug=\{appSlug\} \/>/);
  assert.match(report, /hidden=\{!open\}/);
  assert.match(reportCss, /color:\s*var\(--color-text-muted\)/);
  const toggleRule = /\.toggle\s*\{([^}]*)\}/.exec(reportCss)?.[1] ?? "";
  assert.match(toggleRule, /background:\s*none/, "the quiet toggle has no fill");
  assert.match(toggleRule, /border:\s*0/, "and no border");
  const shelf = page.indexOf('<Shelf title="Similar Apps"');
  const reportAt = page.indexOf("<ReportProblem");
  const sticky = page.indexOf("<StickyInstallBar");
  assert.ok(shelf > 0 && reportAt > shelf && sticky > reportAt, "order: rail, report footer, sticky bar");
  assert.match(formCss, /composes:\s*scope panel from "\.\/glass\/glass\.module\.css"/);
});

test("no text on these sections is painted with the border colour or dimmed with opacity", () => {
  for (const css of [aboutCss, changelogCss, permsCss, reportCss, formCss]) {
    const stripped = code(css);
    assert.ok(!/color:\s*var\(--color-border\)/.test(stripped));
    assert.ok(!/(^|[;{\s])opacity:\s*0?\.\d/m.test(stripped), "no opacity-dimmed text");
  }
});
