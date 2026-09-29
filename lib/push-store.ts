/**
 * Web Push subscription store — leaf `5.k.vii.zo`.
 *
 * SERVER-ONLY. This module holds the Supabase **service-role** key's only
 * code path in the repo. Import it from route handlers, never from a
 * component. The key is read from `SUPABASE_SERVICE_ROLE_KEY` (deliberately
 * not `NEXT_PUBLIC_…`, which Next would inline into browser bundles) at call
 * time, never at import time, so importing this file with the variables unset
 * is safe and `next build` needs neither.
 *
 * Two operations, both over Supabase's PostgREST HTTP API with plain `fetch`:
 *
 * - `upsertSubscription` calls the `replace_push_subscription` SQL function
 *   (`5.k.vii.zi`) — one transaction, so a failure never leaves a device
 *   subscribed to nothing.
 * - `deleteSubscription` deletes the `push_subscription` row by endpoint;
 *   `on delete cascade` removes its slug rows.
 *
 * Decision, recorded: plain `fetch`, not `@supabase/supabase-js`. This module
 * makes two requests against tables and a function whose shape this repo
 * owns; `supabase-js` would be a large new runtime dependency for that (and
 * `5.k.iii.zo` is already adding `web-push`). Nothing here needs its auth,
 * realtime or storage clients.
 *
 * Contract:
 * - Never throws. Every outcome is a `PushStoreResult`.
 * - `not_configured`: `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` unset or
 *   unusable. The routes (`5.k.vi.zi`) map this to `503`.
 * - `unavailable`: the request failed — network error, timeout, redirect, or
 *   a non-2xx response. Deliberately one reason: a caller cannot act on the
 *   difference and a distinct reason would leak how the backend is set up.
 *   The routes should treat it as a server-side failure.
 * - `invalid_input`: the arguments fail `lib/push-validate.ts`. The routes
 *   validate first, so this is a backstop; it is checked before any request.
 * - Nothing here logs or returns the endpoint, `p256dh`/`auth` keys or the
 *   service-role key. PostgREST error bodies are never read either: Postgres
 *   error details quote the failing row (endpoint and keys included), and
 *   PostgREST forwards them. The only log line is a fixed label plus the HTTP
 *   status code.
 * - Requests use `redirect: "error"`, so the service-role key is never
 *   forwarded to a redirect target.
 */

import {
  validateAuth,
  validateEndpoint,
  validateP256dh,
  validateSlugs,
  type ValidPushSubscription,
} from "./push-validate";

export type PushStoreResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "unavailable" | "invalid_input" };

/** Per-request ceiling. Long enough for a cold pooled connection, short enough to fail before a serverless function limit. */
export const PUSH_STORE_TIMEOUT_MS = 8000;

/** Injection points for tests; production callers pass nothing. */
export interface PushStoreDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface Config {
  baseUrl: string;
  key: string;
}

/**
 * `null` when the store cannot be used. The URL must be `https://`, except
 * `http://` for a loopback host (the local Supabase stack listens on
 * `http://127.0.0.1:54321`); anything else would send the service-role key in
 * the clear.
 */
function readConfig(env: Record<string, string | undefined>): Config | null {
  const rawUrl = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rawUrl || !key) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
  if (url.username || url.password) return null;

  return { baseUrl: url.origin, key };
}

/** True when both env vars are present and usable. Lets a route answer `503` before parsing a body. */
export function isPushStoreConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return readConfig(env) !== null;
}

async function send(
  cfg: Config,
  deps: PushStoreDeps,
  method: "POST" | "DELETE",
  path: string,
  body: unknown,
  label: string,
): Promise<PushStoreResult> {
  const doFetch = deps.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? PUSH_STORE_TIMEOUT_MS);
  try {
    const res = await doFetch(`${cfg.baseUrl}${path}`, {
      method,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        Prefer: "return=minimal",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    // Any 2xx is success. The RPC returns void (200 or 204 depending on the
    // PostgREST version) and DELETE with return=minimal returns 204; the body
    // is never read.
    if (res.status >= 200 && res.status < 300) return { ok: true };
    console.error(`push-store: ${label} failed, status ${res.status}`);
    return { ok: false, reason: "unavailable" };
  } catch {
    // Network error, timeout (abort) or a refused redirect. The error object
    // is not logged: its message can contain the request URL.
    console.error(`push-store: ${label} failed, no response`);
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Create or refresh a device's subscription and replace its slug set, in one
 * transaction. An empty `slugs` keeps the subscription with no apps.
 */
export async function upsertSubscription(
  sub: ValidPushSubscription,
  slugs: string[],
  deps: PushStoreDeps = {},
): Promise<PushStoreResult> {
  // Backstop only — the routes validate first. Cheap and pure.
  const checked =
    validateEndpoint(sub?.endpoint).ok &&
    validateP256dh(sub?.p256dh).ok &&
    validateAuth(sub?.auth).ok &&
    validateSlugs(slugs).ok;
  if (!checked) return { ok: false, reason: "invalid_input" };

  const cfg = readConfig(deps.env ?? process.env);
  if (!cfg) return { ok: false, reason: "not_configured" };

  // Argument names must match the SQL function's parameters exactly
  // (PostgREST passes RPC arguments by name).
  return send(
    cfg,
    deps,
    "POST",
    "/rest/v1/rpc/replace_push_subscription",
    { p_endpoint: sub.endpoint, p_p256dh: sub.p256dh, p_auth: sub.auth, p_slugs: slugs },
    "subscribe",
  );
}

/**
 * Remove a device's subscription (its slug rows cascade). Succeeds when the
 * endpoint was never stored, so unsubscribe reveals nothing about what exists.
 */
export async function deleteSubscription(
  endpoint: string,
  deps: PushStoreDeps = {},
): Promise<PushStoreResult> {
  // A string that fails endpoint validation can never be in the table (the
  // subscribe path validates, and the column has an https:// check), so
  // deleting it is a no-op — succeed without a network call.
  if (!validateEndpoint(endpoint).ok) return { ok: true };

  const cfg = readConfig(deps.env ?? process.env);
  if (!cfg) return { ok: false, reason: "not_configured" };

  // encodeURIComponent keeps the value inside the single `endpoint` filter: an
  // `&` or `=` in it cannot add a second PostgREST filter.
  return send(
    cfg,
    deps,
    "DELETE",
    `/rest/v1/push_subscription?endpoint=eq.${encodeURIComponent(endpoint)}`,
    undefined,
    "unsubscribe",
  );
}
