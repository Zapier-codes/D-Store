/**
 * Sitemap XML, pure — leaf `5.l.vi.zo`.
 *
 * No I/O and no imports, so it is safe anywhere and easy to test. `app/sitemap.xml/route.ts` and
 * `app/sitemap-chunks/[chunk]/route.ts` turn catalog data into entries and call these two builders.
 *
 * Why this exists instead of Next's `app/sitemap.ts` convention: that file produces ONE document at
 * `/sitemap.xml`, and `generateSitemaps` replaces `/sitemap.xml` with `/sitemap/<id>.xml` and gives no
 * index. A catalog of 10,000 apps and more needs an index at `/sitemap.xml` that points at chunk
 * documents, each far below the protocol's limits (50,000 URLs and 50 MB uncompressed per document,
 * 50,000 documents per index). The XML is written by hand for the same reason `app/feed.xml/route.ts`
 * writes its own: a literal route segment with an extension, nothing else to wire.
 */

/** The protocol's ceiling per document. The chunk size below is far under it; this guards a bad caller. */
export const SITEMAP_URL_LIMIT = 50000;

/**
 * Rows read per chunk. It is 1,000 on purpose: Supabase's PostgREST answers at most 1,000 rows to one
 * request by default (`max-rows`), and a larger ask would silently come back short. The reader in
 * `lib/catalog-sitemap.ts` also checks the answer against the table's own count and refuses a short
 * chunk, but a chunk that never needs refusing is better.
 */
export const SITEMAP_CHUNK_SIZE = 1000;

/** Most chunk documents an index lists. At 1,000 apiece that is 10 million apps; it only guards garbage. */
export const SITEMAP_CHUNKS_MAX = 10000;

export type SitemapChangeFrequency = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

export interface SitemapEntry {
  /** Absolute URL. */
  url: string;
  lastModified?: Date;
  changeFrequency?: SitemapChangeFrequency;
  /** 0 to 1. */
  priority?: number;
}

/** Text-node and attribute escaping. A URL can hold `&`, so every `<loc>` goes through this. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A valid W3C date-time, or `null` for an invalid `Date` (the element is then left out, not written as `Invalid Date`). */
function lastmod(date: Date | undefined): string | null {
  if (!(date instanceof Date)) return null;
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : null;
}

/** One `<urlset>` document. Throws if given more than `SITEMAP_URL_LIMIT` entries (a caller bug, never data). */
export function buildUrlset(entries: readonly SitemapEntry[]): string {
  if (entries.length > SITEMAP_URL_LIMIT) throw new Error("sitemap: too many URLs for one document");
  const body = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.url)}</loc>`];
      const modified = lastmod(entry.lastModified);
      if (modified) parts.push(`    <lastmod>${modified}</lastmod>`);
      if (entry.changeFrequency) parts.push(`    <changefreq>${entry.changeFrequency}</changefreq>`);
      if (typeof entry.priority === "number" && Number.isFinite(entry.priority)) {
        parts.push(`    <priority>${Math.min(1, Math.max(0, entry.priority)).toFixed(1)}</priority>`);
      }
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}${body ? "\n" : ""}</urlset>\n`;
}

/** One `<sitemapindex>` document listing the given absolute chunk URLs. */
export function buildSitemapIndex(locations: readonly string[]): string {
  if (locations.length > SITEMAP_URL_LIMIT) throw new Error("sitemap: too many documents for one index");
  const body = locations.map((loc) => `  <sitemap>\n    <loc>${escapeXml(loc)}</loc>\n  </sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}${body ? "\n" : ""}</sitemapindex>\n`;
}

/**
 * How many chunk documents a table of `total` rows needs: one per `SITEMAP_CHUNK_SIZE` rows, and never
 * fewer than one (chunk 0 also carries the site's own pages and the first-party apps, which exist
 * when the table is empty).
 */
export function sitemapChunkCount(total: number): number {
  if (!Number.isInteger(total) || total < 0) return 1;
  return Math.min(SITEMAP_CHUNKS_MAX, Math.max(1, Math.ceil(total / SITEMAP_CHUNK_SIZE)));
}

/** The index in `/sitemap-chunks/<index>.xml`, or `null` for anything that is not a plain whole number in range. */
export function parseSitemapChunk(segment: unknown): number | null {
  if (typeof segment !== "string") return null;
  const match = /^(0|[1-9]\d{0,4})\.xml$/.exec(segment);
  if (!match) return null;
  const index = Number(match[1]);
  return index < SITEMAP_CHUNKS_MAX ? index : null;
}

/** The absolute URL of chunk `index`. */
export function sitemapChunkUrl(baseUrl: string, index: number): string {
  return `${baseUrl}/sitemap-chunks/${index}.xml`;
}

/**
 * The site's own pages: home, the category index, search, the three legal pages and one page per
 * taxonomy category. Shared by the whole-catalog sitemap and chunk 0 of the chunked one, so the two
 * list the same pages.
 */
export function sitePageEntries(baseUrl: string, categories: readonly { app_type: string; slug: string }[]): SitemapEntry[] {
  return [
    { url: baseUrl, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/categories`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/search`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/dmca`, changeFrequency: "yearly", priority: 0.2 },
    ...categories.map(
      (category): SitemapEntry => ({
        url: `${baseUrl}/categories/${category.app_type}/${category.slug}`,
        changeFrequency: "weekly",
        priority: 0.6,
      }),
    ),
  ];
}

/** One app's entry. `updatedAt` is the app's own update time; it becomes `<lastmod>`. */
export function appSitemapEntry(baseUrl: string, slug: string, updatedAt: string): SitemapEntry {
  return { url: `${baseUrl}/app/${slug}`, lastModified: new Date(updatedAt), changeFrequency: "weekly", priority: 0.7 };
}

/** One developer page's entry. */
export function developerSitemapEntry(baseUrl: string, developerSlug: string): SitemapEntry {
  return { url: `${baseUrl}/developer/${developerSlug}`, changeFrequency: "monthly", priority: 0.4 };
}
