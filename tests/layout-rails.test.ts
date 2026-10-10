import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * Rails, the two-column layout, the sticky install card and the glass sticky bar (operator-directed 2026-10-08,
 * slice 6 of the details page rework). Source-text guards, the way tests/stat-strip.test.ts does, because the
 * sandbox that wrote them could not render the page. Written, not run.
 */

const page = readFileSync("app/app/[slug]/page.tsx", "utf8");
const pageCss = readFileSync("app/app/[slug]/page.module.css", "utf8");
const card = readFileSync("components/InstallCard.tsx", "utf8");
const cardCss = readFileSync("components/InstallCard.module.css", "utf8");
const header = readFileSync("components/AppHeader.tsx", "utf8");
const headerCss = readFileSync("components/AppHeader.module.css", "utf8");
const bar = readFileSync("components/StickyInstallBar.module.css", "utf8");
const shelf = readFileSync("components/Shelf.tsx", "utf8");
const shelfCss = readFileSync("components/Shelf.module.css", "utf8");
const appCard = readFileSync("components/AppCard.tsx", "utf8");
const appCardCss = readFileSync("components/AppCard.module.css", "utf8");
const gridCss = readFileSync("components/ShelfGrid.module.css", "utf8");

test("the page is two columns from 1100px: a flexible left column and a fixed right column with a sticky card", () => {
  assert.match(pageCss, /@media \(min-width: 1100px\)/);
  assert.match(pageCss, /grid-template-columns:\s*minmax\(0, 1fr\) 340px/);
  assert.match(pageCss, /position:\s*sticky/);
  assert.match(pageCss, /\.side\s*\{\s*display:\s*none/);
  assert.match(page, /className=\{styles\.columns\}/);
  assert.match(page, /<InstallCard app=\{app\} \/>/);
});

test("the header stays above both columns, and the sections come before the card in the DOM", () => {
  const headerAt = page.indexOf("<AppHeader");
  const columnsAt = page.indexOf("styles.columns");
  const galleryAt = page.indexOf("<ScreenshotCarousel");
  const cardAt = page.indexOf("<InstallCard");
  assert.ok(headerAt > 0 && columnsAt > headerAt && galleryAt > columnsAt && cardAt > galleryAt);
});

test("one sticky install per screen: the bar is hidden from 1100px and the header drops its install row there", () => {
  assert.match(bar, /@media \(min-width: 1100px\)\s*\{\s*\.bar\s*\{\s*display:\s*none/);
  assert.match(headerCss, /@media \(min-width: 1100px\)\s*\{\s*\.installRow\s*\{\s*display:\s*none/);
  assert.match(header, /id="primary-install-row"/);
  assert.match(page, /watchTargetId="primary-install-row"/);
});

test("the install card uses the one download control, and the page's one h1 stays the header's", () => {
  assert.match(card, /<DownloadControl app=\{app\} \/>/);
  assert.match(card, /<AppNameTitle as="h2"/);
  assert.ok(!/<h1/.test(card));
  assert.ok(!/VersionAdvisory|InstallButton|ThirdPartyDownloadButton/.test(card));
  assert.match(cardCss, /composes:\s*scope panel from "\.\/glass\/glass\.module\.css"/);
  assert.ok(!/Not provided/.test(card));
});

test("the sticky bar is glass: shared accent scope, one blur, solid under reduced transparency, same reveal behaviour", () => {
  assert.match(bar, /composes:\s*scope from "\.\/glass\/glass\.module\.css"/);
  assert.match(bar, /backdrop-filter:\s*blur\(22px\)/);
  assert.match(bar, /prefers-reduced-transparency: reduce[\s\S]*backdrop-filter:\s*none/);
  assert.match(bar, /\.bar\[data-visible="true"\]/);
  assert.match(bar, /prefers-reduced-motion: reduce/);
});

test("rails: More from this developer and Similar apps use the glass card, each renders nothing when empty", () => {
  assert.match(page, /More from \$\{developer\.name\}/);
  assert.match(page, /<Shelf title="Similar Apps" apps=\{similarApps\} glass \/>/);
  assert.match(shelf, /if \(apps\.length === 0\) return null/);
  assert.match(page, /\(\) => \[\]/, "a failed developer read leaves the rail out, never fails the page");
  assert.match(page, /other\.slug !== app\.slug/);
});

test("the glass card has no blur of its own (a rail can hold a dozen cards) and keeps a text-safe focus ring", () => {
  const glassCard = appCardCss.slice(appCardCss.indexOf(".cardGlass"));
  assert.match(glassCard, /composes:\s*scope from "\.\/glass\/glass\.module\.css"/);
  assert.ok(!/backdrop-filter/.test(glassCard));
  assert.match(glassCard, /outline:\s*2px solid var\(--glass-accent-text\)/);
  assert.match(appCard, /glass\?: boolean/);
});

test("rails inside a column size to the column, and the default grids are untouched", () => {
  assert.match(gridCss, /\.grid\.compact\s*\{\s*grid-template-columns:\s*repeat\(auto-fill, minmax\(min\(8\.5rem, 100%\), 1fr\)\)/);
  assert.match(shelfCss, /\.shelf\.glass\s*\{\s*padding:\s*0/);
});
