import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitKey, tooManyRequests } from "@/lib/rate-limit";
import { incrementViewCount } from "@/lib/catalog";

/**
 * View-count increment endpoint — leaf `3.b.i.zo` (Metrics Pipeline,
 * Counters), the second half of the milestone `3.b.i.zi`'s
 * install-count endpoint started. Same shape, same posture: POST-only,
 * no body, slug from the route segment, delegates the actual mutation
 * to `lib/catalog.ts`'s `incrementViewCount` so this route handler
 * stays agnostic to whether that's backed by the dummy `apps` array
 * (today) or a real Supabase call (once `5.f.i` lands).
 *
 * Fired once per app-detail page load (`ViewPing`, rendered from
 * `app/app/[slug]/page.tsx`) rather than per click — a "view" is the
 * page loading, not a user action on it, unlike the install
 * counter's click-driven trigger.
 *
 * Same anonymous, no-dedup posture as `3.b.i.zi`'s install counter:
 * no auth, and a repeat page load genuinely is another view (real
 * view counters don't dedupe per visitor either). Throttled per client
 * like the install counter (`5.d.ii.zi`): 120 per 10 minutes per hashed
 * client address, fail-open, no slug in the bucket key. Over: 429.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await checkRateLimit(rateLimitKey("view", request.headers), 120, 600))) {
    return tooManyRequests();
  }

  const { slug } = await params;
  const newCount = await incrementViewCount(slug);

  if (newCount === null) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  return NextResponse.json({ slug, view_count: newCount });
}
