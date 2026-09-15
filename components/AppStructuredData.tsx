import type { App } from "@/lib/catalog";

/**
 * schema.org SoftwareApplication structured data — leaf 2.d.iii.zo,
 * closing out 2.d.iii and 2.d (Legal & Compliance) as a whole. Per
 * D-STORE.md §4.G: "structured data (schema.org SoftwareApplication)",
 * paired with the per-app sitemap.xml (2.d.iii.zi) as the two SEO
 * leaves.
 *
 * Rendered from the app detail page (app/app/[slug]/page.tsx) as a
 * <script type="application/ld+json"> tag — every field pulled from
 * the real `App` shape (lib/catalog.ts), not invented placeholder
 * values: `softwareVersion`/`fileSize`/`license`/`permissions` map
 * directly to their `App` fields, `aggregateRating` only renders when
 * `rating_count > 0` (an app with zero ratings shouldn't claim one),
 * and `offers` is a flat free/USD offer since every dummy app in this
 * catalog is free — there's no `price` field on `App` to read a real
 * value from, and D-STORE.md never describes paid listings as part of
 * this catalog's model.
 *
 * No `image` property: no real icon/screenshot image assets exist in
 * this repo yet (`App.icon`/`screenshots` are dummy filenames/paths —
 * the same gap `AppCard.tsx`, `Hero.tsx`, and `ScreenshotCarousel.tsx`
 * already work around with colored placeholder tiles instead of real
 * `<img>`s), and fabricating an image URL that 404s would make the
 * structured data actively wrong rather than just incomplete.
 */
export default function AppStructuredData({
  app,
  categoryName,
  developerName,
}: {
  app: App;
  categoryName: string | null;
  developerName: string | null;
}) {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: app.name,
    description: app.description,
    operatingSystem: "Android",
    softwareVersion: app.version,
    fileSize: `${app.size_mb}MB`,
    license: app.license,
    datePublished: app.created_at,
    dateModified: app.updated_at,
    installUrl: app.apk,
    downloadUrl: app.apk,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  if (categoryName) {
    jsonLd.applicationCategory = categoryName;
  }

  if (app.permissions.length > 0) {
    jsonLd.permissions = app.permissions.join(", ");
  }

  if (developerName) {
    jsonLd.author = { "@type": "Person", name: developerName };
  }

  if (app.rating_count > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: app.avg_rating,
      ratingCount: app.rating_count,
    };
  }

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe as a <script> tag's text content;
      // the `<` escape is defensive only (today's dummy data has none)
      // so this can't turn into a literal "</script>" if a future
      // real-backend description ever contained that substring.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
      }}
    />
  );
}
