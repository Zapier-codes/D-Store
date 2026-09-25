import { getNewAndUpdated } from "@/lib/catalog";

/**
 * /feed.xml — leaf 4.c.i.zi, first leaf of `4.c` (Growth Loops) /
 * `4.c.i` (Syndication). `components/Footer.tsx`'s "About" FAQ answer
 * (`0.j.iv.zo`) and `app/about/page.tsx` both already link to
 * `/feed.xml` as a forward-reference — this leaf is what makes that
 * link resolve instead of 404ing.
 *
 * Uses a plain Next.js Route Handler (`app/feed.xml/route.ts`) rather
 * than a hand-rolled XML string assembled inline in a page component,
 * same reasoning `app/sitemap.ts` gives for using a framework
 * convention over a bespoke route: it's the smallest amount of new
 * machinery that gets a real `/feed.xml` URL serving the right content
 * type. Next's App Router route segments can be a literal filename
 * with an extension (`app/feed.xml/route.ts` → `/feed.xml`), the same
 * pattern used for other literal static paths in this repo's
 * conventions; no rewrite/redirect config needed.
 *
 * Format: RSS 2.0, not Atom — this repo has no existing Atom
 * precedent to match, RSS 2.0 is the format every major feed reader
 * and aggregator still expects by default, and the leaf name
 * ("RSS/Atom feed") only requires one working syndication format, not
 * both. `<link>`/`<guid>` both point at the app's own detail page
 * (`/app/<slug>`), the same canonical URL `app/sitemap.ts` already
 * uses for each app — nothing here should point anywhere that page's
 * <link> in the sitemap doesn't already point.
 *
 * Source: `getNewAndUpdated(Infinity)` — the exact same
 * `updated_at`-descending list `app/charts/new/page.tsx` (`0.g`) shows
 * on `/charts/new`, so this feed is a syndication of a page that
 * already exists, not a second, possibly-diverging ranking. Capped to
 * the 50 most recent entries here (a feed reader's whole reason to
 * exist is "what changed lately," not the full historical catalog the
 * way `/charts/new` and `/sitemap.xml` intentionally show).
 *
 * BASE_URL: same `NEXT_PUBLIC_SITE_URL`-with-fallback constant
 * `app/sitemap.ts` already introduced — reused verbatim rather than
 * re-declaring a second copy of the same env-var/fallback pair, since
 * both files need it for the identical reason (absolute URLs are
 * required, a relative one isn't valid in either an RSS `<link>` or a
 * sitemap entry).
 */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://d-store-nu.vercel.app";
const FEED_TITLE = "D-Store — New & Updated Apps";
const FEED_DESCRIPTION = "Recently added and updated apps on D-Store.";
const MAX_ITEMS = 50;

/** Minimal XML-entity escaping for text nodes — every field this feed emits is user/catalog-authored (app name, summary, developer name), never pre-escaped, and RSS is XML, so `&`/`<`/`>` must not reach the output raw. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * `App.developer_name` is only set for Aptoide-origin apps (see its
 * field comment in `lib/mock-data.ts`) — Zealot-origin apps carry a
 * `developer_slug` instead, resolved against the separate `Developer`
 * table by callers that need a name/bio. Rather than adding a second
 * per-item `getDeveloperBySlug` lookup here (this leaf is the feed
 * itself, not a new join), `<author>` is simply omitted for entries
 * that don't already carry a name — RSS 2.0 makes `<author>` optional
 * per item, so this is a valid, honest omission, not a placeholder.
 */
export async function GET(): Promise<Response> {
  const apps = await getNewAndUpdated(MAX_ITEMS);

  const items = apps
    .map((app) => {
      const url = `${BASE_URL}/app/${app.slug}`;
      const pubDate = new Date(app.updated_at).toUTCString();
      return `    <item>
      <title>${escapeXml(app.name)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${escapeXml(app.summary)}</description>${
        app.developer_name ? `\n      <author>${escapeXml(app.developer_name)}</author>` : ""
      }
      <category>${escapeXml(app.category)}</category>
      <pubDate>${pubDate}</pubDate>
    </item>`;
    })
    .join("\n");

  const lastBuildDate = apps.length > 0 ? new Date(apps[0].updated_at).toUTCString() : new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${BASE_URL}</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>en</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
