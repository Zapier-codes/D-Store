/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Output file tracing decides which files ship in each route's Vercel serverless function. Files read
  // through a path built at runtime (path.join(process.cwd(), ...)) are not picked up by static analysis,
  // so the ones the storefront really reads at runtime are listed here:
  //   - the Zealot index cache and state, including per-tenant copies
  //     (`zealot-index-*.json`) — `lib/sources/zealot.ts`;
  //   - the tenant registry cache and state (`tenant-registry-*.json`) —
  //     `lib/tenant-registry.ts`.
  // `5.l.xix.zo` — the Aptoide snapshot (`aptoide-snapshot*.json`, about 11.5 MB) is no longer listed: the
  // storefront reads third-party apps from the `catalog_app` table, never from those files, and shipping
  // them put the whole snapshot inside every function. The files stay in the repo as import data for the
  // scripts. A NEW runtime file under storage/downloads must be added here or it will be missing from the
  // deployed function while working locally.
  outputFileTracingIncludes: {
    "/**": [
      "./storage/downloads/zealot-index-*.json",
      "./storage/downloads/tenant-registry-*.json",
    ],
  },
  // 3.d.ii.zi — the only real (non-placeholder) icon/screenshot images
  // in the catalog are third-party (Aptoide) entries, all served from
  // this one CDN host (confirmed against the ingested snapshot,
  // storage/downloads/aptoide-snapshot.json). next/image refuses to
  // optimize a remote host that isn't explicitly allow-listed here.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pool.img.aptoide.com",
      },
    ],
  },
  // 5.i.iv.zo — the twelve legacy `/categories/<slug>` URLs (indexed and
  // bookmarked before the two-axis taxonomy) permanently redirect (308) to
  // their Play-model homes, `/categories/<app_type>/<category>`. Done here,
  // not in `app/categories/[appType]/page.tsx`, because a redirect thrown from
  // a page under `app/categories/loading.tsx` runs after the loading shell has
  // already streamed a 200, so it never becomes a real HTTP redirect (seen in
  // `next start`); a config redirect happens before any page renders. Next
  // carries the query string (`license`, `maxSize`) over to the destination.
  //
  // **This table is a hand-kept copy of `LEGACY_TO_PLAY` in `lib/taxonomy.ts`**
  // (this file is plain ESM and cannot import that TypeScript). If a row there
  // changes, change it here in the same commit. That page still exists as the
  // fallback: it 404s any other one-segment slug and would redirect a legacy
  // slug if this table ever missed one.
  async redirects() {
    const legacyToPlay = {
      system: "app/tools",
      multimedia: "app/video-players-and-editors",
      games: "game/uncategorized",
      internet: "app/communication",
      navigation: "app/maps-and-navigation",
      "science-education": "app/education",
      theming: "app/personalization",
      time: "app/productivity",
      reading: "app/books-and-reference",
      writing: "app/productivity",
      development: "app/tools",
      finance: "app/finance",
    };
    return Object.entries(legacyToPlay).map(([legacy, target]) => ({
      source: `/categories/${legacy}`,
      destination: `/categories/${target}`,
      permanent: true,
    }));
  },
};

export default nextConfig;
