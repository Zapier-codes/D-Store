import { NextResponse } from "next/server";
import { getSponsoredApps } from "@/lib/catalog";
import { guardAdminRequest } from "@/lib/admin-auth";

/**
 * Sponsored-placement endpoint — leaf `3.c.i.zo` originally, **write
 * side retired by `5.j.ii.zi`**. Sponsored windows are now authored in
 * the Zealot Console (`5.j.i.zo`) and published in its signed catalog
 * index; this repo stays write-free on the sponsored side, same
 * posture `app/api/admin/apps/[slug]/featuring/route.ts` already set
 * for editorial flags under `5.g.v.zi`.
 *
 * GET still returns every app currently carrying a `sponsored_slots`
 * window (`getSponsoredApps`, most recently updated first) — read-only
 * data the admin listing at `/admin/sponsored` needs, not a mutation.
 *
 * POST (create a slot) answers `410 Gone` rather than attempting the
 * call — there is no local `createSponsoredSlot` to call anymore, the
 * standalone `SponsoredSlot` entity it used to write to was retired by
 * this same leaf. Kept as a route (not deleted) so any existing
 * link/bookmark/client pointed at this path gets a clear "this moved"
 * answer instead of a bare 404, same reasoning the featuring route's
 * own comment gives for keeping its PATCH handler around.
 */
export async function GET(request: Request) {
  const denied = await guardAdminRequest(request);
  if (denied) return denied;

  const apps = await getSponsoredApps();
  return NextResponse.json({ apps });
}

export async function POST(request: Request) {
  const denied = await guardAdminRequest(request);
  if (denied) return denied;

  return NextResponse.json(
    {
      error:
        "Sponsored-slot scheduling is read-only here. Sponsored placement is now authored in the Zealot Console's signed catalog index (5.j.ii.zi) — schedule it there instead.",
    },
    { status: 410 }
  );
}
