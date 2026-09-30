/**
 * Stats store — leaf `5.g.v.zo`.
 *
 * Calls the `store_stats()` Supabase RPC function. Fails soft (returns null)
 * if Supabase is not configured, so the app still builds and runs.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isStatsStoreConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export async function readStoreStats(): Promise<unknown | null> {
  if (!isStatsStoreConfigured()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/store_stats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY!}`,
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
