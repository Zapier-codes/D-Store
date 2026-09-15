import type { MetadataRoute } from "next";
import { getApps, getCategories } from "@/lib/catalog";

/**
 * sitemap.xml — leaf 2.d.iii.zi (Legal & Compliance, SEO), per
 * D-STORE.md §4.G: "SEO: per-app sitemap.xml, structured data
 * (schema.org SoftwareApplication)" — the structured-data half is
 * 2.d.iii.zo, next.
 *
 * Uses Next.js's built-in `app/sitemap.ts` file convention rather than
 * a hand-rolled XML route: it's served at `/sitemap.xml` automatically
 * with the correct `application/xml` content type, no extra route
 * wiring needed.
 *
 * Every URL here goes through `lib/catalog.ts` (0.a.ii.zo), same as
 * every page does — this file never reaches into `lib/mock-data.ts`
 * directly. The per-app URLs are the leaf's namesake and its largest
 * section (`app.updated_at`, the same field the "New & Updated" shelf
 * already sorts on via `getNewAndUpdated`, becomes each entry's real
 * `lastModified` rather than a placeholder). Category, developer, and
 * the three legal pages are included too, since a sitemap missing
 * every *other* real indexable route wouldn't actually be usable for
 * SEO — but per-app is the section this leaf is named for and the
 * only one with real per-item metadata.
 *
 * Developer slugs aren't a listed entity of their own in
 * lib/catalog.ts (only getDeveloperBySlug/getAppsByDeveloper exist,
 * both slug-in) — the unique set is derived from `apps` here instead
 * of adding a new catalog function whose only caller would be this
 * file.
 *
 * BASE_URL: no env var for this existed anywhere in the repo before
 * this leaf, so it introduces NEXT_PUBLIC_SITE_URL, falling back to
 * the known live deployment (https://d-store-nu.vercel.app — the same
 * URL app/page.tsx's own top-of-file comment already cites). Absolute
 * URLs are a sitemap.xml requirement; a relative one isn't valid.
 */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://d-store-nu.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [apps, categories] = await Promise.all([getApps(), getCategories()]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/categories`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/search`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/dmca`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${BASE_URL}/categories/${category.slug}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  // The per-app section this leaf is named for — real lastModified
  // per entry, unlike every other section above/below.
  const appRoutes: MetadataRoute.Sitemap = apps.map((app) => ({
    url: `${BASE_URL}/app/${app.slug}`,
    lastModified: new Date(app.updated_at),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const developerSlugs = Array.from(new Set(apps.map((app) => app.developer_slug)));
  const developerRoutes: MetadataRoute.Sitemap = developerSlugs.map((slug) => ({
    url: `${BASE_URL}/developer/${slug}`,
    changeFrequency: "monthly",
    priority: 0.4,
  }));

  return [...staticRoutes, ...categoryRoutes, ...appRoutes, ...developerRoutes];
}
