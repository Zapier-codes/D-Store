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
 * Scope, deliberately narrow — two fetch behaviors, not general
 * offline browsing of the catalog:
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
 *
 * **Web Push (leaf 5.k.ii.zo) — three more events, none of them
 * fetch handling.** The two behaviors above are the only things this
 * worker does to *requests*; the push events below never touch the
 * fetch path, so nothing in that paragraph changed. They are at the
 * bottom of the file:
 *
 *  - `push` — shows one notification from a minimal payload
 *    (`{ slug, name, version }`, sent by `5.k.iii.zo`). Always shows
 *    something: the subscription is `userVisibleOnly`, and a browser
 *    may penalize or revoke a subscription whose pushes show nothing,
 *    so a missing/malformed payload gets a generic notification
 *    rather than silence.
 *  - `notificationclick` — opens (or focuses) `/app/<slug>`, or
 *    `/saved` when the notification carried no usable slug.
 *  - `pushsubscriptionchange` — re-subscribes and re-sends the saved
 *    slugs to `/api/push/subscribe`, best effort.
 *
 * Notification text is plain text built here from a validated
 * payload; the server never sends markup or URLs, and nothing in this
 * file logs an endpoint or key.
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

/* ------------------------------------------------------------------ *
 * Web Push — leaf 5.k.ii.zo
 * ------------------------------------------------------------------ */

// A worker script cannot import `lib/push-validate.ts`, so the slug rules
// are repeated here. Keep them equal to `SLUG_PATTERN`, `MAX_SLUG_LENGTH`
// and `MAX_SLUGS` there — a slug the server would refuse must not be sent.
const PUSH_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PUSH_MAX_SLUG_LENGTH = 100;
const PUSH_MAX_SLUGS = 200;
// Display caps for payload text: a notification is a line or two, and an
// oversized field is a sign of a bad payload, not something to render.
const PUSH_MAX_NAME_LENGTH = 80;
const PUSH_MAX_VERSION_LENGTH = 40;
const PUSH_REQUEST_TIMEOUT_MS = 10000;

const PUSH_SUBSCRIBE_URL = "/api/push/subscribe";
const PUSH_UNSUBSCRIBE_URL = "/api/push/unsubscribe";
const SAVED_PATH = "/saved";

// `lib/favorites.ts` owns this database; only read it, never write it.
const FAVORITES_DB_NAME = "d-store-favorites";
const FAVORITES_STORE_NAME = "favorites";

function isValidPushSlug(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= PUSH_MAX_SLUG_LENGTH &&
    PUSH_SLUG_PATTERN.test(value)
  );
}

// Plain-text hardening for strings from a push payload: control characters
// and bidirectional overrides (which can make a name read as something it is
// not) become spaces, whitespace is collapsed, the result is cut by code
// point (so a surrogate pair is never split). Returns "" for a non-string.
function cleanPushText(value, max) {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(cleaned).slice(0, max).join("").trim();
}

// `null` when there is no usable payload (no data, not JSON, not an object,
// or no valid slug). A payload without a valid slug is treated as no payload
// at all rather than half-used, because the slug is what the click opens.
function readPushPayload(event) {
  try {
    if (!event.data) return null;
    const raw = event.data.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (!isValidPushSlug(raw.slug)) return null;
    return {
      slug: raw.slug,
      name: cleanPushText(raw.name, PUSH_MAX_NAME_LENGTH),
      version: cleanPushText(raw.version, PUSH_MAX_VERSION_LENGTH),
    };
  } catch (error) {
    return null;
  }
}

function buildNotification(payload) {
  if (!payload) {
    return {
      title: "D-Store",
      options: {
        body: "An app you saved has an update.",
        // A fixed tag: a second payload-less push replaces the first.
        tag: "d-store-update",
        renotify: true,
        data: {},
      },
    };
  }
  return {
    title: payload.name ? payload.name + " has an update" : "An app you saved has an update",
    options: {
      body: payload.version ? "Version " + payload.version + " is available." : "A new version is available.",
      // One notification per app: a newer version of the same app replaces
      // the older one (the client half of the sender's per-slug `Topic`).
      // `renotify` makes the replacement alert again instead of updating silently.
      tag: "d-store-update-" + payload.slug,
      renotify: true,
      data: { slug: payload.slug },
    },
  };
}

self.addEventListener("push", (event) => {
  const { title, options } = buildNotification(readPushPayload(event));
  event.waitUntil(
    Promise.resolve()
      .then(() => self.registration.showNotification(title, options))
      .catch(() =>
        // Something in the options was refused: still show the plainest
        // possible notification, since a push that shows nothing is the
        // one outcome to avoid.
        self.registration.showNotification("D-Store", { body: "An app you saved has an update." })
      )
      .catch(() => {
        // Permission was revoked or the platform refuses; nothing more to do.
      })
  );
});

// The path a notification opens. Rebuilt from a re-validated slug rather than
// trusting a stored URL, so nothing but `/app/<valid slug>` or `/saved` can
// ever be opened from here.
function pathForNotificationData(data) {
  const slug = data && typeof data === "object" ? data.slug : undefined;
  return isValidPushSlug(slug) ? "/app/" + slug : SAVED_PATH;
}

async function focusOrOpen(path) {
  try {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      try {
        if (new URL(client.url).pathname === path && typeof client.focus === "function") {
          return await client.focus();
        }
      } catch (error) {
        // An unreadable client URL is skipped; fall through to the next.
      }
    }
  } catch (error) {
    // No window list available: open a new one instead.
  }
  if (self.clients.openWindow) {
    return self.clients.openWindow(new URL(path, self.location.origin).href);
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(focusOrOpen(pathForNotificationData(event.notification.data)).catch(() => {}));
});

// The saved slugs, in the shape `selectSlugs` (`lib/push-support.ts`) sends:
// valid slugs only, newest first, de-duplicated, capped at the server's
// maximum. Resolves to `null` — not `[]` — when the database cannot be read,
// because an empty list would make the server forget every app this device
// follows; "could not read" must never be sent as "follows nothing".
function readFavoriteSlugs() {
  return new Promise((resolve) => {
    try {
      const request = self.indexedDB.open(FAVORITES_DB_NAME);
      // Opening without a version creates an empty database when none exists.
      // This worker must not create the app's database (it would block the
      // page's own upgrade path), so abort and report "unknown".
      request.onupgradeneeded = () => {
        try {
          request.transaction.abort();
        } catch (error) {
          // Nothing else to do; onerror below resolves.
        }
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        const finish = (value) => {
          try {
            db.close();
          } catch (error) {
            // Already closed.
          }
          resolve(value);
        };
        try {
          if (!db.objectStoreNames.contains(FAVORITES_STORE_NAME)) {
            finish(null);
            return;
          }
          const getAll = db.transaction(FAVORITES_STORE_NAME, "readonly").objectStore(FAVORITES_STORE_NAME).getAll();
          getAll.onsuccess = () => finish(pickSlugs(getAll.result));
          getAll.onerror = () => finish(null);
        } catch (error) {
          finish(null);
        }
      };
    } catch (error) {
      resolve(null);
    }
  });
}

function pickSlugs(records) {
  if (!Array.isArray(records)) return [];
  const candidates = [];
  for (const record of records.slice(0, 10000)) {
    if (!record || typeof record !== "object" || !isValidPushSlug(record.slug)) continue;
    candidates.push({ slug: record.slug, addedAt: typeof record.addedAt === "string" ? record.addedAt : "" });
  }
  candidates.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const seen = new Set();
  const slugs = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.slug)) continue;
    seen.add(candidate.slug);
    slugs.push(candidate.slug);
    if (slugs.length === PUSH_MAX_SLUGS) break;
  }
  return slugs;
}

async function postJson(url, body) {
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timer = setTimeout(() => controller && controller.abort(), PUSH_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      signal: controller ? controller.signal : undefined,
    });
    return response.ok;
  } catch (error) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Runs when the browser drops or replaces this device's push subscription
// (expiry, or the push service rotating it). Best effort, and every failure
// path leaves things recoverable: `components/PushSync.tsx` re-sends the slug
// set on the next page load whenever a subscription exists, so a failure here
// costs a delay, not the subscription. Deliberately no rollback (unlike
// `enablePush`, which unsubscribes a subscription the server rejected): that
// rollback protects a visitor who is looking at the screen; here nobody is,
// and keeping the subscription is what lets the next visit repair it.
async function resubscribe(event) {
  const old = event.oldSubscription || null;
  let subscription = event.newSubscription || null;

  if (!subscription) {
    // Only the old subscription remembers the VAPID key; this worker has no
    // access to the page's `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Without it there is
    // nothing to subscribe with — the visitor's next visit sees "off" and can
    // switch notifications back on.
    const key = old && old.options ? old.options.applicationServerKey : null;
    if (!key) return;
    subscription = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
  }

  const slugs = await readFavoriteSlugs();
  if (slugs === null) return; // unknown, not empty — see readFavoriteSlugs

  const stored = await postJson(PUSH_SUBSCRIBE_URL, { subscription: subscription.toJSON(), slugs });
  if (!stored) return;

  // The dead address is otherwise only removed when a send to it fails.
  if (old && typeof old.endpoint === "string" && old.endpoint !== subscription.endpoint) {
    await postJson(PUSH_UNSUBSCRIBE_URL, { endpoint: old.endpoint });
  }
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(resubscribe(event).catch(() => {}));
});
