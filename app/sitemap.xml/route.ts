import { CatalogUnavailableError, getSitemapChunkCount } from "@/lib/catalog";
import { buildSitemapIndex, sitemapChunkUrl } from "@/lib/sitemap-xml";

/**
 * /sitemap.xml — leaf 2.d.iii.zi (Legal & Compliance, SEO), per D-STORE.md §4.G: "SEO: per-app
 * sitemap.xml, structured data (schema.org SoftwareApplication)". Reworked by leaf `5.l.vi.zo`
 * from the `app/sitemap.ts` file convention to a route handler, because the catalog can now hold
 * tens of thousands of apps and one document cannot (the protocol allows 50,000 URLs and 50 MB per
 * document).
 *
 * Leaf `5.l.xx.zi`: ONE shape, a `<sitemapindex>` listing `/sitemap-chunks/<n>.xml`, one document per
 * 1,000 published rows (`app/sitemap-chunks/[chunk]`). Only a count is read here; the documents are
 * read when a crawler asks for them. The single whole-catalog `<urlset>` this route used to fall back
 * to (the Supabase env unset, or a failed count) is gone, and so is its `getApps()` call.
 *
 * Answers:
 * - 200 with the `<sitemapindex>`.
 * - 503 with `Retry-After: 300` and `Cache-Control: no-store` when the count cannot be read, or when
 *   the Supabase env is not usable (decided and recorded in `HANDOVER.md`, for the operator to
 *   overrule): never an empty or a short sitemap, because a crawler that is told "no apps" may drop
 *   the URLs it already knows, and `no-store` keeps a CDN from holding the failure. Any other error is
 *   not caught and is a `500`.
 *
 * Every URL goes through `lib/catalog.ts` (0.a.ii.zo), same as every page does. `app.updated_at`,
 * the field the "New & Updated" shelf sorts on, is each app's `<lastmod>` (set in the chunk route).
 *
 * BASE_URL: `NEXT_PUBLIC_SITE_URL`, falling back to the known live deployment (the URL
 * `app/page.tsx`'s own top-of-file comment cites). Absolute URLs are a sitemap requirement.
 *
 * Caching: `force-dynamic` so a build never freezes the answer (the build has no Supabase env, so a
 * prerendered copy would be the failure form for good), and a `Cache-Control` for the CDN on a good
 * answer: an hour fresh, a day stale-while-revalidate, which is how often a crawler needs it.
 */

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://d-store-nu.vercel.app";

const HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET(): Promise<Response> {
  let chunkCount: number;
  try {
    chunkCount = await getSitemapChunkCount();
  } catch (error) {
    if (error instanceof CatalogUnavailableError) return failureResponse();
    throw error;
  }
  const locations = Array.from({ length: chunkCount }, (_, index) => sitemapChunkUrl(BASE_URL, index));
  return new Response(buildSitemapIndex(locations), { headers: HEADERS });
}

function failureResponse(): Response {
  return new Response("Sitemap temporarily unavailable", {
    status: 503,
    headers: { "Cache-Control": "no-store", "Retry-After": "300" },
  });
}
