import { getSitemapChunk } from "@/lib/catalog";
import { useCatalogTable } from "@/lib/sources/catalog-table";
import { buildUrlset, parseSitemapChunk } from "@/lib/sitemap-xml";

/**
 * /sitemap-chunks/<n>.xml — leaf `5.l.vi.zo`. One document of the chunked sitemap that
 * `/sitemap.xml` indexes in table mode: chunk `n` is rows `n * 1000` to `n * 1000 + 999` of the
 * published catalog by slug, and chunk 0 also carries the site's own pages, the category pages and
 * the first-party apps (`getSitemapChunk` in `lib/catalog.ts` says exactly what, and why developer
 * pages are first-party only).
 *
 * Answers:
 * - 200 with a `<urlset>`.
 * - 404 for a segment that is not `<whole number>.xml`, for any chunk when the table is not in use
 *   (there is no chunked sitemap then, `/sitemap.xml` is a single document), and for an index at or
 *   past the table's chunk count.
 * - 503 with `no-store` when the table could not be read. Never an empty or a short document: a
 *   crawler that is told "no apps" may drop what it already knows, and a CDN must not keep it.
 *
 * `force-dynamic` and the same one-hour CDN cache as `/sitemap.xml`; see that file for the reasons.
 */

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://d-store-nu.vercel.app";

export async function GET(_request: Request, { params }: { params: Promise<{ chunk: string }> }): Promise<Response> {
  const index = parseSitemapChunk((await params).chunk);
  if (index === null) return new Response("Not found", { status: 404 });
  // No chunked sitemap exists with the table off, so there is nothing to find; this is not an outage.
  if (!useCatalogTable()) return new Response("Not found", { status: 404 });

  const chunk = await getSitemapChunk(index, BASE_URL);
  if (chunk === null) return failureResponse(); // table in use, read failed
  if (index >= chunk.chunkCount) return new Response("Not found", { status: 404 });

  return new Response(buildUrlset(chunk.entries), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

function failureResponse(): Response {
  return new Response("Sitemap temporarily unavailable", {
    status: 503,
    headers: { "Cache-Control": "no-store", "Retry-After": "300" },
  });
}
