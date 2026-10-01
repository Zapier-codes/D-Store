/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `lib/sources/aptoide.ts`'s loadSnapshot() reads
  // storage/downloads/aptoide-snapshot.json via fs.readFile with a
  // path built at runtime (path.join(process.cwd(), ...)), not a
  // static import — Next's output file tracing (what decides which
  // files ship in each route's Vercel serverless function bundle)
  // works by statically analyzing imports/requires, so it does not
  // reliably pick up a file only ever reached this way. Without this,
  // the snapshot can be present and correct in the repo and in local
  // `next build`/`next start` (which read straight off disk, no
  // tracing involved) while still being silently absent from the
  // deployed function on Vercel — every route that calls
  // `getMergedApps()` would then fall back to `loadSnapshot`'s
  // empty-array catch path and quietly show only the two Zealot-origin
  // apps. Declared for '/**' (every route) rather than just the
  // specific catalog routes, since `getMergedApps()` is called from
  // enough different pages (home, categories, app detail, developer,
  // search, charts) that enumerating them individually here would just
  // be a second, easier-to-forget copy of that call-site list.
  //
  // `5.h.x.zo` — this used to be "./storage/downloads/**", which also shipped
  // the ingest scripts' WORKING files (the crawl's candidate list, the
  // `getMeta` results, checkpoints, last-run reports) into every route's
  // function. Those can grow without bound and nothing at runtime reads them,
  // so only the files the storefront actually reads are listed:
  //   - the Aptoide snapshot, its shards and its header
  //     (`aptoide-snapshot.json`, `aptoide-snapshot.<n>.json`,
  //     `aptoide-snapshot.meta.json`) — `lib/sources/aptoide.ts`;
  //   - the Zealot index cache and state, including per-tenant copies
  //     (`zealot-index-*.json`) — `lib/sources/zealot.ts`;
  //   - the tenant registry cache and state (`tenant-registry-*.json`) —
  //     `lib/tenant-registry.ts`.
  // A NEW runtime file under storage/downloads must be added here or it will be
  // missing from the deployed function while working locally.
  outputFileTracingIncludes: {
    "/**": [
      "./storage/downloads/aptoide-snapshot*.json",
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
