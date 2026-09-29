/**
 * Web Push subscription store — leaves `5.k.vii.zo` and `5.k.xi.zo`.
 *
 * SERVER-ONLY. This module holds the Supabase **service-role** key's only
 * code path in the repo. Import it from route handlers, never from a
 * component. The key is read from `SUPABASE_SERVICE_ROLE_KEY` (deliberately
 * not `NEXT_PUBLIC_…`, which Next would inline into browser bundles) at call
 * time, never at import time, so importing this file with the variables unset
 * is safe and `next build` needs neither.
 *
 * Three operations, all over Supabase's PostgREST HTTP API with plain `fetch`:
 *
 * - `upsertSubscription` calls the `replace_push_subscription` SQL function
 *   (`5.k.vii.zi`) — one transaction, so a failure never leaves a device
 *   subscribed to nothing.
 * - `deleteSubscription` deletes the `push_subscription` row by endpoint;
 *   `on delete cascade` removes its slug rows.
 * - `readDispatchState` (`5.k.xi.zo`) is the only operation that reads a
 *   response body: the distinct subscribed slugs (`subscribed_slugs()`,
 *   `5.k.xi.zi`) and the `push_notified_version` baselines for them. It is
 *   read-only; baseline writes belong to the sender (`5.k.iii.zo`).
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
 * - `readDispatchState` never returns a partial answer: any failure, a
 *   malformed row, an oversized body or a full page is `unavailable`. Its
 *   only log lines are a fixed label plus a status code, never a slug list.
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

// ---------------------------------------------------------------------------
// Dispatch state read — leaf `5.k.xi.zo`
// ---------------------------------------------------------------------------

/**
 * PostgREST's `max_rows` (`supabase/config.toml`, and Supabase's hosted
 * default). PostgREST truncates a result to this many rows *silently* — no
 * error, no marker — so a page of exactly this size cannot be told apart
 * from a truncated one and is treated as `unavailable`. Planning against a
 * truncated slug set would quietly stop alerting the apps past the cut.
 * If the project's `max_rows` is ever raised, raise this with it; if it is
 * lowered below this, the guard stops protecting anything, so keep them equal.
 */
export const PUSH_MAX_ROWS = 1000;

/**
 * Slugs per `push_notified_version` read. The slugs go in the URL
 * (`slug=in.(a,b,…)`), and every valid slug is `[a-z0-9-]` and at most
 * `MAX_SLUG_LENGTH` (100) characters, so 50 slugs is at most ~5.2 KB of
 * query string — inside the 8 KB request-line limit common to proxies and
 * servers — and a batch can never come near `PUSH_MAX_ROWS` rows. 1000
 * subscribed slugs is therefore at most 20 requests.
 */
export const PUSH_BASELINE_BATCH = 50;

/**
 * Hard cap on bytes read from any one response body. The largest legitimate
 * body is a full-size slug list (~1000 × ~120 bytes ≈ 120 KB); 512 KiB leaves
 * room for PostgREST's JSON spacing without letting a wrong or hostile
 * upstream stream an unbounded body into a serverless function's memory.
 */
export const PUSH_MAX_BODY_BYTES = 512 * 1024;

export type DispatchStateResult =
  | { ok: true; subscribedSlugs: string[]; baselines: Map<string, string> }
  | { ok: false; reason: "not_configured" | "unavailable" };

type ReadJson = { ok: true; json: unknown } | { ok: false };

/**
 * One request whose JSON body is read, with the byte cap and the same
 * timeout / `redirect: "error"` as `send()`. The timeout covers reading the
 * body too, not just the headers. PostgREST error bodies are never read (they
 * can quote row data), and only a fixed label plus the status is logged.
 */
async function readJson(
  cfg: Config,
  deps: PushStoreDeps,
  method: "GET" | "POST",
  path: string,
  body: unknown,
  label: string,
): Promise<ReadJson> {
  const doFetch = deps.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? PUSH_STORE_TIMEOUT_MS);
  try {
    const res = await doFetch(`${cfg.baseUrl}${path}`, {
      method,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status < 200 || res.status >= 300) {
      console.error(`push-store: ${label} failed, status ${res.status}`);
      return { ok: false };
    }

    // Trust a declared length only to reject early; the streamed count below
    // is what actually enforces the cap.
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > PUSH_MAX_BODY_BYTES) {
      console.error(`push-store: ${label} failed, body too large`);
      await res.body?.cancel().catch(() => undefined);
      return { ok: false };
    }

    let text: string;
    if (res.body) {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > PUSH_MAX_BODY_BYTES) {
          await reader.cancel().catch(() => undefined);
          console.error(`push-store: ${label} failed, body too large`);
          return { ok: false };
        }
        chunks.push(value);
      }
      const all = new Uint8Array(total);
      let at = 0;
      for (const c of chunks) {
        all.set(c, at);
        at += c.byteLength;
      }
      text = new TextDecoder("utf-8", { fatal: true }).decode(all);
    } else {
      // A Response without a stream (empty body). Nothing to cap.
      text = await res.text();
    }

    try {
      return { ok: true, json: JSON.parse(text) };
    } catch {
      console.error(`push-store: ${label} failed, body is not JSON`);
      return { ok: false };
    }
  } catch {
    // Network error, timeout (abort), refused redirect or undecodable bytes.
    // The error object is not logged: its message can contain the request URL.
    console.error(`push-store: ${label} failed, no response`);
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Everything the dispatch plan (`buildPlan`, `5.k.x.zo`) needs from the
 * database: which slugs have at least one subscriber, and the last version
 * each was notified about.
 *
 * 1. `POST /rest/v1/rpc/subscribed_slugs` with an empty JSON object. The
 *    function returns `table(slug text)`, which PostgREST serializes as an
 *    array of `{ "slug": … }` objects — every row is validated, not assumed.
 * 2. `GET /rest/v1/push_notified_version?select=slug,version&slug=in.(…)`,
 *    in batches of `PUSH_BASELINE_BATCH`, for exactly those slugs.
 *
 * `baselines` holds only rows for subscribed slugs; a subscribed slug with
 * no row is simply absent, which `classifyApp` reads as "no baseline yet".
 * That is the one legitimate way a slug is missing, so a caller must never
 * treat an empty map as a failure — and this function never returns an empty
 * map *because* a read failed: any failure is `unavailable`.
 *
 * `unavailable` covers: network error, timeout, redirect, non-2xx, a body over
 * `PUSH_MAX_BODY_BYTES`, non-JSON, a row of the wrong shape (a slug that
 * fails `validateSlugs`, a duplicate, a baseline row for a slug that was not
 * asked for, a non-string or blank version) and a slug page of
 * `PUSH_MAX_ROWS` or more. The batches run one after another, each with its
 * own timeout, so the worst case is (1 + batches) × `PUSH_STORE_TIMEOUT_MS`;
 * the route's own platform limit is the caller's concern.
 */
export async function readDispatchState(deps: PushStoreDeps = {}): Promise<DispatchStateResult> {
  const cfg = readConfig(deps.env ?? process.env);
  if (!cfg) return { ok: false, reason: "not_configured" };

  const unavailable: DispatchStateResult = { ok: false, reason: "unavailable" };

  // Argument list is empty; PostgREST needs a JSON object body for an RPC.
  const slugRead = await readJson(cfg, deps, "POST", "/rest/v1/rpc/subscribed_slugs", {}, "dispatch slugs");
  if (!slugRead.ok) return unavailable;

  const rows = slugRead.json;
  if (!Array.isArray(rows)) return unavailable;
  // Checked before anything else about the rows: a full page may be a
  // truncated one.
  if (rows.length >= PUSH_MAX_ROWS) {
    console.error("push-store: dispatch slugs failed, page is at the row limit");
    return unavailable;
  }

  const seen = new Set<string>();
  const subscribedSlugs: string[] = [];
  for (const row of rows) {
    if (!isRecord(row)) return unavailable;
    const slug = row.slug;
    if (typeof slug !== "string" || !validateSlugs([slug]).ok) return unavailable;
    if (seen.has(slug)) return unavailable; // the function groups; a repeat means it is not what we think
    seen.add(slug);
    subscribedSlugs.push(slug);
  }

  const baselines = new Map<string, string>();
  for (let i = 0; i < subscribedSlugs.length; i += PUSH_BASELINE_BATCH) {
    const batch = subscribedSlugs.slice(i, i + PUSH_BASELINE_BATCH);
    // Slugs are `[a-z0-9-]` (validated above), so they need no quoting or
    // escaping inside PostgREST's `in.(…)` list.
    const read = await readJson(
      cfg,
      deps,
      "GET",
      `/rest/v1/push_notified_version?select=slug,version&slug=in.(${batch.join(",")})`,
      undefined,
      "dispatch baselines",
    );
    if (!read.ok || !Array.isArray(read.json)) return unavailable;

    const asked = new Set(batch);
    for (const row of read.json) {
      if (!isRecord(row)) return unavailable;
      const { slug, version } = row;
      if (typeof slug !== "string" || !asked.has(slug) || baselines.has(slug)) return unavailable;
      // `version` is `not null` in the table; blank would read as "no
      // baseline" downstream and re-notify, so it is a malformed row here.
      if (typeof version !== "string" || version.trim() === "") return unavailable;
      baselines.set(slug, version);
    }
  }

  return { ok: true, subscribedSlugs, baselines };
}
