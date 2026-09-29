import {
  browserPushSupportEnv,
  getPushSupport,
  getVapidPublicKey,
  type PushSupportEnv,
} from "@/lib/push-support";

/**
 * Browser-side Web Push flow — leaf `5.k.viii.zo`, second of the two
 * `5.k.viii` leaves (split out of `5.k.ii.zi`). Builds on the pure helpers in
 * `lib/push-support.ts` and talks to the routes from `5.k.vi.zi`. No React and
 * no UI: the sync component (`5.k.ix.zi`) and the `/saved` control
 * (`5.k.ix.zo`) call these functions. Client code only — do not import it
 * from server code.
 *
 * Rules every function here follows:
 *  - It returns a typed result and never throws.
 *  - It never logs, displays or returns the endpoint or the keys (there is no
 *    `console` call in this file). The one place the endpoint leaves the
 *    device is the request body to our own routes.
 *  - Globals are read when a function is *called*, never at import, and can
 *    be replaced through `deps` so Node can drive it with fakes.
 *
 * `enablePush` must be called from a click handler. The permission prompt is
 * the first thing it awaits — before the service worker, IndexedDB or the
 * network — because Safari treats any earlier `await` as a lost user
 * gesture and silently refuses to prompt.
 */

export const SUBSCRIBE_URL = "/api/push/subscribe";
export const UNSUBSCRIBE_URL = "/api/push/unsubscribe";
/** `navigator.serviceWorker.ready` never resolves if registration failed, so it is raced against this. */
export const DEFAULT_READY_TIMEOUT_MS = 8000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

/** `on` needs both a granted permission and a live subscription. */
export type PushState = "off" | "on" | "denied";

/**
 * - `subscribed` — stored on the server.
 * - `denied` — permission refused (now, or already blocked in browser settings).
 * - `dismissed` — the prompt was closed without an answer; permission is still `default`.
 * - `not_available` — cannot work here right now: no/malformed VAPID key, an
 *   unsupported browser, or the server answered `503` (deployment not
 *   configured — the expected state until the operator sets the Supabase env).
 *   Show "not available right now", not an error.
 * - `failed` — anything else: `400`/`502`, network error, timeout, `subscribe` throwing.
 */
export type EnableResult = "subscribed" | "denied" | "dismissed" | "not_available" | "failed";

export type SyncResult = "synced" | "no_subscription" | "not_available" | "failed";

/** `none` = there was nothing to remove on that side. */
export interface DisableResult {
  ok: boolean;
  server: "ok" | "failed" | "none";
  local: "ok" | "failed" | "none";
}

/** Everything is optional; omitted fields fall back to the page's globals at call time. */
export interface PushClientDeps {
  navigator?: Navigator;
  Notification?: typeof Notification;
  fetch?: typeof fetch;
  supportEnv?: PushSupportEnv;
  /** `undefined` = read `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; `null` = force "no key". */
  vapidKey?: Uint8Array | null;
  readyTimeoutMs?: number;
  requestTimeoutMs?: number;
}

interface Resolved {
  nav: Navigator;
  N: typeof Notification;
  doFetch: typeof fetch;
  readyMs: number;
  requestMs: number;
}

function resolve(deps?: PushClientDeps): Resolved | null {
  const nav = deps?.navigator ?? (typeof navigator === "undefined" ? undefined : navigator);
  const N = deps?.Notification ?? (typeof Notification === "undefined" ? undefined : Notification);
  const doFetch = deps?.fetch ?? (typeof fetch === "undefined" ? undefined : fetch.bind(globalThis));
  if (!nav || !N || !doFetch || !("serviceWorker" in nav)) return null;
  return {
    nav,
    N,
    doFetch,
    readyMs: deps?.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
    requestMs: deps?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  };
}

const TIMED_OUT = Symbol("timed out");

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolveRace, rejectRace) => {
    const timer = setTimeout(() => resolveRace(TIMED_OUT), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolveRace(value);
      },
      (error) => {
        clearTimeout(timer);
        rejectRace(error);
      },
    );
  });
}

/** Supports both the promise form and the old callback-only form of `requestPermission`. */
function askPermission(N: typeof Notification): Promise<NotificationPermission> {
  return new Promise((resolveAsk, rejectAsk) => {
    try {
      const maybe = N.requestPermission((permission) => resolveAsk(permission)) as unknown;
      if (maybe && typeof (maybe as Promise<NotificationPermission>).then === "function") {
        (maybe as Promise<NotificationPermission>).then(resolveAsk, rejectAsk);
      }
    } catch (error) {
      rejectAsk(error);
    }
  });
}

async function post(
  doFetch: typeof fetch,
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<"ok" | "unavailable" | "failed"> {
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const response = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
    if (response.ok) return "ok";
    return response.status === 503 ? "unavailable" : "failed";
  } catch {
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}

async function unsubscribeQuietly(sub: PushSubscription): Promise<boolean> {
  try {
    return await sub.unsubscribe();
  } catch {
    return false;
  }
}

/** `true` when the subscription was made with `key`, or when the browser does not say. */
function madeWithKey(sub: PushSubscription, key: Uint8Array): boolean {
  try {
    const current = sub.options?.applicationServerKey;
    if (!current) return true;
    const bytes = new Uint8Array(current);
    return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
  } catch {
    return true;
  }
}

async function existingSubscription(nav: Navigator): Promise<PushSubscription | null> {
  // `getRegistration` resolves even when nothing is registered; `ready` would hang.
  const registration = await nav.serviceWorker.getRegistration();
  return registration ? await registration.pushManager.getSubscription() : null;
}

/** Whether notifications are on for this device: needs a granted permission *and* a subscription. */
export async function getPushState(deps?: PushClientDeps): Promise<PushState> {
  try {
    const r = resolve(deps);
    if (!r) return "off";
    if (r.N.permission === "denied") return "denied";
    if (r.N.permission !== "granted") return "off";
    return (await existingSubscription(r.nav)) ? "on" : "off";
  } catch {
    return "off";
  }
}

/**
 * Turn notifications on and send the server the slugs to notify about.
 * Call it from a click handler and do not `await` anything before it.
 *
 * **Rollback:** if this call created the browser subscription and the
 * server did not accept it, the subscription is removed again, so the browser
 * never holds one the server does not know about. A subscription that already
 * existed is left alone when only a re-send fails — it is still registered
 * with the server from before, and dropping it would lose a working setup.
 *
 * **Key rotation:** a subscription made with a different VAPID key is
 * replaced, because the browser refuses to `subscribe` with a new key over
 * an old one and pushes signed with the new key would never reach it.
 */
export async function enablePush(slugs: string[], deps?: PushClientDeps): Promise<EnableResult> {
  try {
    // Synchronous checks only until the prompt — nothing here may `await`.
    const r = resolve(deps);
    if (!r) return "not_available";
    const key = deps?.vapidKey !== undefined ? deps.vapidKey : getVapidPublicKey();
    if (!key) return "not_available";
    if (getPushSupport(deps?.supportEnv ?? browserPushSupportEnv()) !== "supported") return "not_available";

    if (r.N.permission === "denied") return "denied";
    if (r.N.permission !== "granted") {
      const answer = await askPermission(r.N); // the first await, on purpose
      if (answer === "denied") return "denied";
      if (answer !== "granted") return "dismissed";
    }

    const registration = await raceTimeout(r.nav.serviceWorker.ready, r.readyMs);
    if (registration === TIMED_OUT) return "failed";

    let sub = await registration.pushManager.getSubscription();
    if (sub && !madeWithKey(sub, key)) {
      await unsubscribeQuietly(sub);
      sub = null;
    }
    let created = false;
    if (!sub) {
      // A fresh copy, backed by a plain ArrayBuffer, is what `subscribe` is typed to take.
      sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: new Uint8Array(key) });
      created = true;
    }

    const outcome = await post(r.doFetch, SUBSCRIBE_URL, { subscription: sub.toJSON(), slugs }, r.requestMs);
    if (outcome === "ok") return "subscribed";
    if (created) await unsubscribeQuietly(sub);
    return outcome === "unavailable" ? "not_available" : "failed";
  } catch {
    return "failed";
  }
}

/**
 * Turn notifications off. Asks the server to forget the endpoint, then removes
 * the browser subscription **whether or not that request succeeded** — the
 * visitor asked to stop, so the device must stop even if the server could not
 * be reached (the row is then removed the next time the push service reports
 * the address gone). The result says which half failed.
 */
export async function disablePush(deps?: PushClientDeps): Promise<DisableResult> {
  try {
    const r = resolve(deps);
    if (!r) return { ok: true, server: "none", local: "none" };
    const sub = await existingSubscription(r.nav);
    if (!sub) return { ok: true, server: "none", local: "none" };

    const outcome = await post(r.doFetch, UNSUBSCRIBE_URL, { endpoint: sub.endpoint }, r.requestMs);
    const localOk = await unsubscribeQuietly(sub);
    const server = outcome === "ok" ? "ok" : "failed";
    const local = localOk ? "ok" : "failed";
    return { ok: server === "ok" && local === "ok", server, local };
  } catch {
    return { ok: false, server: "failed", local: "failed" };
  }
}

/**
 * Re-send the slug list for the existing subscription (the server replaces the
 * whole set). Makes no request when there is no subscription or permission is
 * not granted.
 */
export async function syncSlugs(slugs: string[], deps?: PushClientDeps): Promise<SyncResult> {
  try {
    const r = resolve(deps);
    if (!r || r.N.permission !== "granted") return "no_subscription";
    const sub = await existingSubscription(r.nav);
    if (!sub) return "no_subscription";
    const outcome = await post(r.doFetch, SUBSCRIBE_URL, { subscription: sub.toJSON(), slugs }, r.requestMs);
    if (outcome === "ok") return "synced";
    return outcome === "unavailable" ? "not_available" : "failed";
  } catch {
    return "failed";
  }
}
