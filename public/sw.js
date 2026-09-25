/*
 * Service worker — leaf 4.b.i.zo (Progressive Web App → Installability
 * → Service worker offline shell), right behind `4.b.i.zi` (Web app
 * manifest). Registered by `components/ServiceWorkerRegister.tsx`.
 *
 * A plain vanilla worker with no build-time tooling (no Workbox/
 * next-pwa dependency added to package.json) — matching this repo's
 * existing preference for native platform APIs over a library
 * wherever the platform API covers the need (native `<dialog>` for
 * the lightbox, `IntersectionObserver` for scroll reveal and
 * `StickyInstallBar`, the checkbox hack for the mobile nav). The
 * Cache API and the fetch event are the native APIs this leaf needs.
 *
 * Scope, deliberately narrow — two things, not general offline
 * browsing of the catalog:
 *
 * 1. **Navigation fallback.** Every page here is server-rendered per
 *    request (`app/layout.tsx` reads the theme/region cookies on
 *    every render, `lib/catalog.ts` reads a runtime `fs.readFile`
 *    merged-catalog snapshot) — there is no static HTML this worker
 *    could serve offline that would actually be correct, so this
 *    deliberately does NOT cache page HTML. Instead: try the network
 *    first for any navigation; if that fetch fails (offline), serve
 *    the precached `/offline` page (`app/offline/page.tsx`) instead of
 *    the browser's default disconnected-tab error. That's the "shell"
 *    this leaf is named for.
 * 2. **Runtime caching of hashed static assets.** Next's own build
 *    output under `/_next/static/*` is content-hashed and immutable —
 *    a given hashed filename never changes, so once fetched it's safe
 *    to cache indefinitely (cache-first). This is opportunistic
 *    (populated as the visitor browses, not precached — the hashes
 *    change every build, so hardcoding them here would go stale the
 *    next deploy) rather than a full asset manifest, matching leaf
 *    `4.b.i.zi`'s own note about the manifest's icon needing to be a
 *    static, unhashed file for exactly this reason.
 *
 * Everything else (API routes, `/manifest.webmanifest`, page data)
 * passes straight through untouched — no interception, no caching —
 * since caching a dynamic response as if it were static would risk
 * serving stale data to an *online* visitor, which is worse than this
 * leaf not existing at all.
 */

const CACHE_VERSION = "4.b.i.zo-v1";
const SHELL_CACHE = `d-store-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `d-store-runtime-${CACHE_VERSION}`;

// Precached at install — just enough for `/offline` to render
// correctly with no network at all: the route itself, plus the two
// static assets `app/layout.tsx`/`app/manifest.ts` (4.b.i.zi) point at
// that aren't already covered by the runtime `_next/static` cache.
const PRECACHE_URLS = ["/offline", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      // Activate this worker immediately on first install rather than
      // waiting for every open tab to close — there's nothing in this
      // worker that could break an already-open page by taking over
      // mid-session, since it only ever intercepts failed navigations
      // and immutable hashed assets.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever intercept same-origin GETs — a POST (rating submission,
  // admin actions) or a cross-origin request (e.g. the Aptoide-hosted
  // icon/screenshot images allow-listed in next.config.mjs) is left
  // completely untouched, falling through to the browser's normal
  // network handling.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline").then((cached) => cached ?? Response.error()))
    );
    return;
  }

  if (request.url.includes("/_next/static/")) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ??
            fetch(request).then((response) => {
              // Hashed build assets are only ever served with a 200 —
              // don't cache an opaque/error response.
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
        )
      )
    );
  }
});
