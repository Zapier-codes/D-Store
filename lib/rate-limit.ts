/**
 * Shared rate limiter — leaf `5.k.vi.zo`.
 *
 * Calls a Supabase RPC function `check_rate_limit` to atomically increment
 * a counter in a time window. Fails open (returns true) if Supabase is not
 * configured, so local dev/preview works unimpeded.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isRateLimitConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Checks rate limit via Supabase RPC.
 * @param key A string identifying the bucket (e.g. `push-dispatch`, `install:com.whatsapp`)
 * @param max Maximum requests in the window.
 * @param windowSeconds The size of the sliding window in seconds.
 * @returns True if the request is allowed, false if throttled.
 */
export async function checkRateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  if (!isRateLimitConfigured()) {
    return true; // Fail open in dev
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_rate_limit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY!}`,
      },
      body: JSON.stringify({ p_key: key, p_max: max, p_window_seconds: windowSeconds }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.error(`Rate limit RPC failed: HTTP ${res.status}`);
      return true; // Fail open on RPC error to avoid blocking site features
    }

    const data = await res.json();
    return Boolean(data);
  } catch (error) {
    console.error("Rate limit check error:", error instanceof Error ? error.message : error);
    return true; // Fail open
  }
}
