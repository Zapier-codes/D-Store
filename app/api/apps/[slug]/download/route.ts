import { checkRateLimit, rateLimitKey, tooManyRequests } from "@/lib/rate-limit";
import { getAppBySlug } from "@/lib/catalog";
import { isThirdParty } from "@/lib/trust";
import { allowedUpstreamHosts, downloadFilename, isAllowedUpstream, pickUpstreamUrl } from "@/lib/download-proxy";

/**
 * The store's own download door for first-party apps.
 *
 * Zealot's `/download/releases/:id` redirects to a signed GitHub storage URL, and a browser shows the final
 * host (`githubusercontent.com`) in its downloads list. This route fetches the same file server-side and
 * streams it back, so the visitor only ever sees this store's domain, with the "name and version" file name
 * (`appstore-1.1.4.apk`) whatever the stored asset is called. The body is streamed, never buffered; `Range`
 * is passed through so a browser can resume. Third-party apps are not served here (they link to their own
 * source), and only `https` URLs on the Zealot host list are ever fetched.
 *
 * Throttled per client (30 downloads per 10 minutes, fail-open like the other routes). The function's time
 * limit caps one download at `maxDuration`; a very slow connection on a large file can be cut off, and the
 * browser then resumes with a `Range` request.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await checkRateLimit(rateLimitKey("download", request.headers), 30, 600))) {
    return tooManyRequests();
  }

  const { slug } = await params;
  const app = await getAppBySlug(slug);
  if (!app || isThirdParty(app) || app.version_status === "pulled") {
    return new Response("Not found", { status: 404 });
  }

  const requested = new URL(request.url).searchParams.get("version");
  const upstreamUrl = pickUpstreamUrl(app, requested);
  if (!isAllowedUpstream(upstreamUrl, allowedUpstreamHosts())) {
    return new Response("Not found", { status: 404 });
  }

  const headers: Record<string, string> = {};
  const range = request.headers.get("range");
  if (range) headers.range = range;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, { headers, redirect: "follow", cache: "no-store" });
  } catch {
    return new Response("The file could not be fetched. Try again.", { status: 502 });
  }
  if ((upstream.status !== 200 && upstream.status !== 206) || upstream.body === null) {
    return new Response("The file could not be fetched. Try again.", { status: 502 });
  }

  const out = new Headers({
    "content-type": "application/vnd.android.package-archive",
    "content-disposition": `attachment; filename="${downloadFilename(app.slug, requested || app.version)}"`,
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  for (const name of ["content-length", "content-range"]) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
