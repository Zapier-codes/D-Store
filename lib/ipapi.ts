/**
 * ipapi.co IP-geolocation client — leaf 0.h.i.zi (Geo-Regionalization
 * Foundation, `0.h`). See HANDOVER.md's "Scope addition" note: this is
 * the one Phase 0 leaf allowed a real external network call —
 * everything else in the catalog still runs on `lib/mock-data.ts`.
 *
 * Scope for *this* leaf is deliberately narrow — just the client:
 * a typed response shape, a hard timeout, and a soft fallback to a
 * default region on any error, non-2xx status, or ipapi.co's own
 * in-body `{ error: true }` shape (their free tier returns HTTP 200
 * with an error body for some failure modes, not just a 4xx/5xx
 * status, so both have to be checked). What this leaf does *not* do:
 *   - No caching / once-per-session dedup — that's 0.h.i.zo, next,
 *     which wraps this client in a region-context provider.
 *   - No React context, no cookie, no component wiring — same leaf.
 *   - No catalog coupling — `App.available_regions` doesn't exist yet
 *     (0.h.ii.zi), so nothing here can filter anything yet.
 * `lookupRegion()` is the entire public surface for now.
 *
 * ipapi.co's free tier is explicitly a testing/evaluation plan, not a
 * production one — ~1,000 lookups/day. That ceiling is exactly why
 * "never block rendering" and "fail soft to a default" are hard
 * requirements here, not just nice-to-haves: once the real quota is
 * hit, every subsequent lookup *will* fail, and the app has to keep
 * working as if geolocation were never wired in at all.
 */

const IPAPI_URL = "https://ipapi.co/json/";
const TIMEOUT_MS = 2500;

/** The subset of ipapi.co's `/json/` response this app actually uses. Their full response has many more fields (city, lat/long, currency, timezone, ...) that nothing here needs yet. */
interface IpapiSuccessResponse {
  country_code: string; // ISO 3166-1 alpha-2, e.g. "US"
  country_name: string;
}

/** ipapi.co's own error shape — returned with HTTP 200 for some failure modes (e.g. a malformed/private request IP), and typically alongside HTTP 429 for rate-limiting. Either way, `error: true` means don't trust the rest of the body. */
interface IpapiErrorResponse {
  error: true;
  reason?: string;
}

export interface RegionLookupResult {
  country_code: string;
  country_name: string;
  /** "ipapi" — a real lookup succeeded. "default" — anything failed and this is the fallback; callers can use this to decide whether to retry later, but must never block on it. */
  source: "ipapi" | "default";
}

/**
 * The fallback region for every failure path: non-2xx status,
 * `{ error: true }` body, timeout, network error, or an unparseable
 * response. Deliberately the biggest single English-speaking market
 * rather than e.g. a "global"/unset value, so a downstream region
 * filter (0.h.ii.zo) still has something concrete to narrow against
 * instead of a null case it also has to special-case.
 */
const DEFAULT_REGION: RegionLookupResult = {
  country_code: "US",
  country_name: "United States",
  source: "default",
};

/**
 * Looks up the caller's region from their IP via ipapi.co. Always
 * resolves — never throws, never hangs past `TIMEOUT_MS` — falling
 * back to `DEFAULT_REGION` on any failure. Safe to call directly from
 * a Server Component or Route Handler; nothing here can block a
 * render past `TIMEOUT_MS`.
 */
export async function lookupRegion(): Promise<RegionLookupResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(IPAPI_URL, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    // Covers both a 429 (rate limit) and any other non-2xx status —
    // per the module comment, ipapi.co doesn't always use status
    // codes consistently for errors, so this is a first filter, not
    // the only one.
    if (!res.ok) {
      return DEFAULT_REGION;
    }

    const body: unknown = await res.json();

    if (isIpapiError(body) || !isIpapiSuccess(body)) {
      return DEFAULT_REGION;
    }

    return {
      country_code: body.country_code,
      country_name: body.country_name,
      source: "ipapi",
    };
  } catch {
    // AbortError (timeout), network failure, or res.json() throwing on
    // a non-JSON body — all fail soft the same way.
    return DEFAULT_REGION;
  } finally {
    clearTimeout(timer);
  }
}

function isIpapiError(body: unknown): body is IpapiErrorResponse {
  return typeof body === "object" && body !== null && (body as { error?: unknown }).error === true;
}

function isIpapiSuccess(body: unknown): body is IpapiSuccessResponse {
  if (typeof body !== "object" || body === null) return false;
  const candidate = body as Partial<IpapiSuccessResponse>;
  return typeof candidate.country_code === "string" && candidate.country_code.length > 0;
}
