/**
 * Shared rate limiter — leaf `5.k.vi.zo` (reused by `5.d.ii.zi` / `5.d.ii.zo`).
 *
 * Fixed-window counters kept in Supabase (`public.rate_limit`, atomic SQL
 * function `check_rate_limit`), so they survive across serverless instances.
 * The bucket key is `scope` + a salted SHA-256 of the client address: no raw
 * IP is ever stored or logged.
 *
 * Failure policy is the caller's choice:
 *   - `failOpen: true`  (default) — Supabase unset or erroring lets the request
 *     through. Right for public read-ish routes (views, installs, reviews,
 *     reports) so an outage does not take the site down.
 *   - `failOpen: false` — unset or erroring means "throttled". Right for the
 *     routes that write to a secret-bearing table (push subscribe/unsubscribe),
 *     where an unthrottled write is the thing this leaf exists to prevent.
 *
 * Env is read when called, not at import, so tests can inject it.
 */

import { createHash } from "node:crypto";

export interface RateLimitOptions {
  failOpen?: boolean;
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injected for tests; defaults to `process.env`. */
  env?: Record<string, string | undefined>;
}

export function isRateLimitConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * The caller's address from the proxy headers, or `"unknown"`. Vercel sets
 * `x-forwarded-for` (client first) and `x-real-ip`; only the first entry is
 * used, and it is capped so a hostile header cannot be huge.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded ? forwarded.split(",")[0].trim() : "";
  const candidate = first || headers.get("x-real-ip")?.trim() || "";
  return candidate ? candidate.slice(0, 64) : "unknown";
}

/**
 * Builds a bucket key like `report:ab12…` — `scope` names the route (and, where
 * wanted, the app), the rest is a salted hash of the client address. Set
 * `RATE_LIMIT_SALT` in production so the hashes cannot be reversed by
 * brute-forcing the IPv4 space.
 */
export function rateLimitKey(
  scope: string,
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
): string {
  const salt = env.RATE_LIMIT_SALT ?? "";
  const hash = createHash("sha256").update(`${salt}|${clientAddress(headers)}`).digest("hex").slice(0, 32);
  return `${scope}:${hash}`;
}

/**
 * @param key bucket key, normally from `rateLimitKey`
 * @param max most requests allowed in one window
 * @param windowSeconds window length (fixed windows aligned to the epoch)
 * @returns true if the request may proceed, false if it is throttled
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
  options: RateLimitOptions = {},
): Promise<boolean> {
  const { failOpen = true, fetchImpl = fetch, env = process.env } = options;
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return failOpen;

  try {
    const res = await fetchImpl(`${url}/rest/v1/rpc/check_rate_limit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ p_key: key, p_max: max, p_window_seconds: windowSeconds }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return failOpen;
    return (await res.json()) === true;
  } catch {
    // Nothing logged: the error text can carry the request URL.
    return failOpen;
  }
}

export function tooManyRequests(): Response {
  return Response.json(
    { error: "Too many requests" },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
  );
}
