import { cookies } from "next/headers";
import type { RegionLookupResult } from "./ipapi";

/**
 * Region persistence (read side) — leaf 0.h.i.zo. Mirrors the
 * `lib/theme.ts` / cookie-read-in-a-server-component shape (0.b.iii.zi)
 * on purpose, but for a different reason: theme uses a cookie because
 * there's no login to hang a per-user preference off (D-STORE.md §3),
 * while region uses one because it's the only place available to cache
 * a value written by middleware and read by a Server Component before
 * the first byte of HTML — there's no shared in-memory store between
 * the two in a serverless/edge deployment.
 *
 * The write side lives in `middleware.ts` (`lookupRegion()` + this
 * file's `encodeRegion`) — this file only reads.
 */

export const REGION_COOKIE_NAME = "d-store-region";

// Kept in sync with lib/ipapi.ts's own DEFAULT_REGION — used here too
// so a visitor whose middleware pass somehow failed to set the cookie
// (e.g. middleware itself erroring) still gets a valid region rather
// than `getRegion()` needing a nullable return type every caller has
// to guard against.
const DEFAULT_REGION: RegionLookupResult = {
  country_code: "US",
  country_name: "United States",
  source: "default",
};

/** Serializes a lookup result for the cookie. The only writer is `middleware.ts`. */
export function encodeRegion(region: RegionLookupResult): string {
  return JSON.stringify(region);
}

function decodeRegion(value: string | undefined): RegionLookupResult {
  if (!value) return DEFAULT_REGION;
  try {
    const parsed: unknown = JSON.parse(value);
    if (isRegionLookupResult(parsed)) {
      return parsed;
    }
  } catch {
    // Malformed cookie (hand-edited, truncated, stale shape from a
    // future format change) — fall through to the default rather than
    // surfacing a parse error to a page render.
  }
  return DEFAULT_REGION;
}

function isRegionLookupResult(value: unknown): value is RegionLookupResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<RegionLookupResult>;
  return (
    typeof candidate.country_code === "string" &&
    typeof candidate.country_name === "string" &&
    (candidate.source === "ipapi" || candidate.source === "default")
  );
}

/**
 * Reads the visitor's cached region server-side. Call this from a
 * server component (the root layout, same as `getTheme()`) — by the
 * time any page renders, `middleware.ts` has already run and the
 * cookie is guaranteed to be present (falls back to `DEFAULT_REGION`
 * regardless, as a defensive measure, not the expected path).
 */
export async function getRegion(): Promise<RegionLookupResult> {
  const store = await cookies();
  return decodeRegion(store.get(REGION_COOKIE_NAME)?.value);
}
