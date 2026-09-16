import { NextResponse } from "next/server";
import { getSponsoredSlots, createSponsoredSlot } from "@/lib/catalog";

/**
 * Sponsored-slot scheduling endpoint — leaf `3.c.i.zo`. Backs
 * `app/admin/sponsored`'s list + "schedule a new slot" form.
 *
 * GET returns every scheduled slot (`getSponsoredSlots`, most recently
 * created first), not just the currently-active one — the admin UI
 * needs to show past/future/overlapping bookings, not just what's live
 * right now (that's `getActiveSponsoredSlot`, consumed by
 * `SponsoredCard` directly, not exposed as its own route since nothing
 * outside this repo's own server-rendered `SponsoredCard` needs it).
 *
 * POST creates a new slot from `{ name, summary, start_date, end_date }`
 * — all four required, `start_date`/`end_date` as `YYYY-MM-DD` strings
 * validated for both shape and chronological order (end not before
 * start) before being handed to `createSponsoredSlot`.
 *
 * Same dev-only, unauthenticated posture as
 * `app/api/admin/apps/[slug]/featuring/route.ts` (`3.c.i.zi`) — that
 * leaf's Current-position note already decided this is the default
 * for the rest of `3.c`, not re-litigated per leaf.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const slots = await getSponsoredSlots();
  return NextResponse.json({ slots });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, summary, start_date, end_date } = body as Record<string, unknown>;

  if (typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof summary !== "string" || summary.trim() === "") {
    return NextResponse.json({ error: "summary is required" }, { status: 400 });
  }
  if (typeof start_date !== "string" || !DATE_RE.test(start_date)) {
    return NextResponse.json({ error: "start_date must be a YYYY-MM-DD string" }, { status: 400 });
  }
  if (typeof end_date !== "string" || !DATE_RE.test(end_date)) {
    return NextResponse.json({ error: "end_date must be a YYYY-MM-DD string" }, { status: 400 });
  }
  if (end_date < start_date) {
    return NextResponse.json({ error: "end_date must not be before start_date" }, { status: 400 });
  }

  const slot = await createSponsoredSlot({ name, summary, start_date, end_date });
  return NextResponse.json({ slot }, { status: 201 });
}
