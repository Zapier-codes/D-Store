import { NextResponse } from "next/server";
import { guardAdminRequest } from "@/lib/admin-auth";

/**
 * Admin featuring-toggle endpoint — leaf `3.c.i.zi` originally,
 * **disabled by `5.g.v.zi`**. Featured/Editors' Pick are now read
 * straight from the Console's (Zealot) signed index
 * (`lib/sources/zealot.ts`'s `editorial` block) instead of a local
 * toggle, per that leaf's own text: "this repo stays write-free on the
 * editorial side." `lib/catalog.ts`'s `setAppFeaturing` always throws
 * now rather than silently mutating dummy state that the next index
 * fetch would just overwrite anyway — this route reflects that by
 * answering `410 Gone` rather than attempting the call.
 *
 * Kept as a route (not deleted) so `app/admin/featuring`'s existing
 * link/bookmark to it, and any client still pointing at this path,
 * gets a clear "this moved" answer instead of a bare 404. Still
 * admin-gated (`guardAdminRequest`) so the 410 body isn't handed out
 * to unauthenticated callers.
 */
export async function PATCH(request: Request) {
  const denied = await guardAdminRequest(request);
  if (denied) return denied;

  return NextResponse.json(
    {
      error:
        "Featuring is read-only here. Featured/Editors' Pick are now sourced from the Zealot Console's signed catalog index (5.g.v.zi) — set them there instead.",
    },
    { status: 410 }
  );
}
