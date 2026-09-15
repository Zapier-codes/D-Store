import { NextResponse, type NextRequest } from "next/server";
import { lookupRegion } from "@/lib/ipapi";
import { REGION_COOKIE_NAME, encodeRegion } from "@/lib/region";

/**
 * Region-context provider — leaf 0.h.i.zo, the "calls the client once
 * per visitor session" half of the pair. `lib/ipapi.ts` (0.h.i.zi) is
 * the client that can make the call; this is what makes sure it's
 * only actually made once.
 *
 * Middleware is the only place in this app that can both read
 * incoming request cookies *and* set a response cookie before any
 * page renders — a Server Component can read cookies but can't set
 * them outside a Server Action, and a Server Action only runs in
 * response to a user interaction, not on first page load. So: if the
 * region cookie is already present, skip straight through (the common
 * case for every request after the first); if it's missing, call
 * `lookupRegion()` once and set the cookie on the response before it
 * reaches the browser.
 *
 * No `maxAge`/`expires` on the cookie — a session cookie, cleared when
 * the browser closes, matching "once per visitor session" from the
 * roadmap line verbatim. (Contrast with `lib/theme.ts`'s cookie, which
 * is a deliberate one-year *preference*, not a session cache — the two
 * cookies have different jobs and are inconsistent on purpose.)
 *
 * `lookupRegion()` itself never blocks past its own 2.5s timeout
 * (0.h.i.zi) and never throws, so the worst case here is a single
 * request that's ~2.5s slower on a cold cache, not a hung request.
 */
export async function middleware(request: NextRequest) {
  if (request.cookies.has(REGION_COOKIE_NAME)) {
    return NextResponse.next();
  }

  const region = await lookupRegion();
  const response = NextResponse.next();
  response.cookies.set(REGION_COOKIE_NAME, encodeRegion(region), {
    path: "/",
    sameSite: "lax",
  });
  return response;
}

export const config = {
  // Skip Next's own static/image assets and the favicon — nothing
  // there needs a region, and there's no point spending the lookup on
  // a request that isn't a page.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
