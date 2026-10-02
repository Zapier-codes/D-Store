import assert from "node:assert/strict";
import test from "node:test";
import {
  SITEMAP_CHUNK_SIZE,
  SITEMAP_URL_LIMIT,
  appSitemapEntry,
  buildSitemapIndex,
  buildUrlset,
  escapeXml,
  parseSitemapChunk,
  sitePageEntries,
  sitemapChunkCount,
  sitemapChunkUrl,
} from "../lib/sitemap-xml";

// Leaf 5.l.vi.zo. Written, NOT run (standing operator instruction, 2026-10-02: no testing).

const BASE = "https://example.test";

test("escapeXml escapes the five XML characters, ampersand first", () => {
  assert.equal(escapeXml(`a&b<c>d"e'f`), "a&amp;b&lt;c&gt;d&quot;e&apos;f");
  assert.equal(escapeXml("&amp;"), "&amp;amp;");
});

test("buildUrlset writes loc, lastmod, changefreq and priority, and escapes the URL", () => {
  const xml = buildUrlset([
    { url: `${BASE}/a?x=1&y=2`, lastModified: new Date("2026-09-10T12:00:00Z"), changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/b` },
  ]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.ok(xml.includes(`<loc>${BASE}/a?x=1&amp;y=2</loc>`));
  assert.ok(xml.includes("<lastmod>2026-09-10T12:00:00.000Z</lastmod>"));
  assert.ok(xml.includes("<changefreq>weekly</changefreq>"));
  assert.ok(xml.includes("<priority>0.7</priority>"));
  assert.equal(xml.match(/<url>/g)?.length, 2);
  // The second entry has only a loc.
  assert.ok(xml.includes(`<url>\n    <loc>${BASE}/b</loc>\n  </url>`));
  assert.ok(xml.endsWith("</urlset>\n"));
});

test("buildUrlset leaves out an invalid date instead of writing Invalid Date", () => {
  const xml = buildUrlset([{ url: `${BASE}/a`, lastModified: new Date("not a date") }]);
  assert.ok(!xml.includes("lastmod"));
  assert.ok(!xml.includes("Invalid"));
});

test("buildUrlset clamps priority to 0..1 and an empty list is still a valid document", () => {
  const xml = buildUrlset([{ url: `${BASE}/a`, priority: 7 }, { url: `${BASE}/b`, priority: -1 }]);
  assert.ok(xml.includes("<priority>1.0</priority>"));
  assert.ok(xml.includes("<priority>0.0</priority>"));
  assert.equal(buildUrlset([]), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n');
});

test("buildUrlset refuses more URLs than the protocol allows", () => {
  const entries = Array.from({ length: SITEMAP_URL_LIMIT + 1 }, (_, i) => ({ url: `${BASE}/${i}` }));
  assert.throws(() => buildUrlset(entries));
  assert.doesNotThrow(() => buildUrlset(entries.slice(0, SITEMAP_URL_LIMIT)));
});

test("buildSitemapIndex lists each chunk URL", () => {
  const xml = buildSitemapIndex([sitemapChunkUrl(BASE, 0), sitemapChunkUrl(BASE, 1)]);
  assert.ok(xml.includes("<sitemapindex xmlns="));
  assert.ok(xml.includes(`<loc>${BASE}/sitemap-chunks/0.xml</loc>`));
  assert.ok(xml.includes(`<loc>${BASE}/sitemap-chunks/1.xml</loc>`));
  assert.equal(xml.match(/<sitemap>/g)?.length, 2);
  assert.ok(xml.endsWith("</sitemapindex>\n"));
});

test("sitemapChunkCount is one per 1,000 rows and never below one", () => {
  assert.equal(SITEMAP_CHUNK_SIZE, 1000);
  assert.equal(sitemapChunkCount(0), 1);
  assert.equal(sitemapChunkCount(1), 1);
  assert.equal(sitemapChunkCount(1000), 1);
  assert.equal(sitemapChunkCount(1001), 2);
  assert.equal(sitemapChunkCount(10000), 10);
  assert.equal(sitemapChunkCount(-5), 1);
  assert.equal(sitemapChunkCount(1.5), 1);
  assert.equal(sitemapChunkCount(Number.NaN), 1);
});

test("parseSitemapChunk accepts only <whole number>.xml in range", () => {
  assert.equal(parseSitemapChunk("0.xml"), 0);
  assert.equal(parseSitemapChunk("12.xml"), 12);
  assert.equal(parseSitemapChunk("9999.xml"), 9999);
  for (const bad of ["10000.xml", "01.xml", "-1.xml", "1.5.xml", "1", "1.XML", "a.xml", ".xml", "1.xml/", "1.xml?x", undefined, 3, null]) {
    assert.equal(parseSitemapChunk(bad as unknown), null, String(bad));
  }
});

test("sitePageEntries lists the six site pages and one per category", () => {
  const entries = sitePageEntries(BASE, [{ app_type: "app", slug: "tools" }, { app_type: "game", slug: "sports" }]);
  const urls = entries.map((e) => e.url);
  assert.deepEqual(urls.slice(0, 6), [BASE, `${BASE}/categories`, `${BASE}/search`, `${BASE}/privacy`, `${BASE}/terms`, `${BASE}/dmca`]);
  assert.deepEqual(urls.slice(6), [`${BASE}/categories/app/tools`, `${BASE}/categories/game/sports`]);
});

test("appSitemapEntry uses the app's update time as lastmod", () => {
  const entry = appSitemapEntry(BASE, "my-app", "2026-09-10T12:00:00+00:00");
  assert.equal(entry.url, `${BASE}/app/my-app`);
  assert.equal(entry.lastModified?.toISOString(), "2026-09-10T12:00:00.000Z");
});
