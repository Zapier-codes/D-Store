import { getApps, getSitemapChunkCount, getTaxonomyCategories } from "@/lib/catalog";
import {
  appSitemapEntry,
  buildSitemapIndex,
  buildUrlset,
  developerSitemapEntry,
  SITEMAP_URL_LIMIT,
  sitePageEntries,
  sitemapChunkUrl,
  type SitemapEntry,
} from "@/lib/sitemap-xml";

/**
 * /sitemap.xml — leaf 2.d.iii.zi (Legal & Compliance, SEO), per D-STORE.md §4.G: "SEO: per-app
 * sitemap.xml, structured data (schema.org SoftwareApplication)". Reworked by leaf `5.l.vi.zo`
 * from the `app/sitemap.ts` file convention to a route handler, because the catalog can now hold
 * tens of thousands of apps and one document cannot (the protocol allows 50,000 URLs and 50 MB per
 * document).
 *
 * Two shapes at the same URL:
 * - Table mode (`CATALOG_SOURCE=table`, the Supabase env set): a `<sitemapindex>` listing
 *   `/sitemap-chunks/<n>.xml`, one document per 1,000 published rows (`app/sitemap-chunks/[chunk]`).
 *   Only a count is read here. The documents are read when a crawler asks for them.
 * - Otherwise, or when the count could not be read: the single `<urlset>` this route always was,
 *   with every app, built from the whole catalog. A failed table read therefore degrades to the old
 *   behaviour (which itself falls back to the snapshot) rather than to an empty sitemap.
 *
 * Every URL goes through `lib/catalog.ts` (0.a.ii.zo), same as every page does. `app.updated_at`,
 * the field the "New & Updated" shelf sorts on, is each app's `<lastmod>`. Developer slugs are
 * derived from the apps (only `getDeveloperBySlug` and `getAppsByDeveloper` exist, both slug-in).
 *
 * BASE_URL: `NEXT_PUBLIC_SITE_URL`, falling back to the known live deployment (the URL
 * `app/page.tsx`'s own top-of-file comment cites). Absolute URLs are a sitemap requirement.
 *
 * Caching: `force-dynamic` so a build never freezes the answer (the build has no Supabase env, so a
 * prerendered copy would be the whole-catalog form for good), and a `Cache-Control` for the CDN: an
 * hour fresh, a day stale-while-revalidate, which is how often a crawler needs it.
 */

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://d-store-nu.vercel.app";

const HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

/** The whole-catalog sitemap: exactly what `app/sitemap.ts` produced before leaf `5.l.vi.zo`. */
async function buildWholeCatalogSitemap(): Promise<string> {
  const [apps, categories] = await Promise.all([getApps(), getTaxonomyCategories()]);

  const entries: SitemapEntry[] = [
    ...sitePageEntries(BASE_URL, categories),
    // The per-app section this leaf is named for — real lastModified per entry.
    ...apps.map((app) => appSitemapEntry(BASE_URL, app.slug, app.updated_at)),
    ...Array.from(new Set(apps.map((app) => app.developer_slug))).map((slug) => developerSitemapEntry(BASE_URL, slug)),
  ];
  // Over the protocol's ceiling only if the whole-catalog path is serving a table-sized catalog (a
  // failed table read); a cut document is better than a 500, and the chunked form is the fix.
  return buildUrlset(entries.slice(0, SITEMAP_URL_LIMIT));
}

export async function GET(): Promise<Response> {
  const chunkCount = await getSitemapChunkCount();
  if (chunkCount !== null) {
    const locations = Array.from({ length: chunkCount }, (_, index) => sitemapChunkUrl(BASE_URL, index));
    return new Response(buildSitemapIndex(locations), { headers: HEADERS });
  }
  return new Response(await buildWholeCatalogSitemap(), { headers: HEADERS });
}
