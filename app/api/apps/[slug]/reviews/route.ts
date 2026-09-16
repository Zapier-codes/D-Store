import { NextResponse } from "next/server";
import { submitReview } from "@/lib/catalog";

/**
 * Review submission endpoint — leaf `3.b.ii.zi` (Metrics Pipeline,
 * Aggregation). Unlike `3.b.i`'s install/view counters, a review is
 * an actual resource with its own identity, not just a number going
 * up — hence `POST /api/apps/[slug]/reviews` (resource-shaped),
 * rather than the verb-shaped `/install`/`/view` routes.
 *
 * Body: `{ "stars": number }`, validated as an integer 1–5 here
 * before `submitReview` (`lib/catalog.ts`) ever runs — the route
 * handler's job is request validation, the aggregation logic itself
 * lives in `lib/catalog.ts` alongside the seam every other write in
 * this file already goes through.
 *
 * Anonymous, same posture as every other write path in this repo
 * (`Review`, `ReportFlag`, the two counters): no auth, nothing stops
 * a repeat submission in the same session. Rate-limiting is the same
 * already-separately-scoped `5.d.ii.zi` noted on the counters.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const stars = (body as { stars?: unknown })?.stars;
  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    return NextResponse.json({ error: "stars must be an integer from 1 to 5" }, { status: 400 });
  }

  const result = await submitReview(slug, stars);
  if (result === null) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  return NextResponse.json({ slug, ...result });
}
