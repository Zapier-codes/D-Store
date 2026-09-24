import { NextResponse } from "next/server";
import { setAppFeaturing } from "@/lib/catalog";
import { guardAdminRequest } from "@/lib/admin-auth";

/**
 * Admin featuring-toggle endpoint — leaf `3.c.i.zi` (Admin/Editorial
 * Tools, Featuring). Flips `is_featured`/`is_editors_pick` on the app
 * at `slug`, backing `app/admin/featuring`'s toggle UI.
 *
 * PATCH with a JSON body of `{ is_featured?: boolean, is_editors_pick?:
 * boolean }` — either key is optional, matching `setAppFeaturing`'s
 * signature in `lib/catalog.ts`, so the UI can flip one flag per
 * request without needing to resend the other's current value.
 *
 * Dev-only surface, not auth-gated: this whole `3.c` track is
 * admin-facing rather than storefront-facing, and the Current
 * Position note flagged that its auth posture (its own gated surface
 * vs. staying dev-only) was worth deciding early rather than assuming.
 * Decided here, for this leaf: stays unauthenticated for now, the same
 * way this repo's entire Phase 0/3 scope runs against dummy data with
 * no real backend behind it yet — `2.b.iii.zo`'s HTTP-Basic admin
 * firewall is Symfony-side (`legacy-symfony/`) and doesn't reach this
 * Next.js app at all. Real auth for this surface is real-backend work,
 * naturally sequenced behind `5.f.i` (Supabase) landing, not something
 * to half-wire against dummy data now. Revisit once `5.g.iii.zi`
 * (verified-developer badge, sourced from the Console's Supabase-side
 * agreement status) gives this repo its first real read of
 * privileged/account state to key an admin check off of.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const denied = await guardAdminRequest(request);
  if (denied) return denied;

  const { slug } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { is_featured, is_editors_pick } = body as {
    is_featured?: unknown;
    is_editors_pick?: unknown;
  };

  if (is_featured !== undefined && typeof is_featured !== "boolean") {
    return NextResponse.json({ error: "is_featured must be a boolean" }, { status: 400 });
  }
  if (is_editors_pick !== undefined && typeof is_editors_pick !== "boolean") {
    return NextResponse.json({ error: "is_editors_pick must be a boolean" }, { status: 400 });
  }
  if (is_featured === undefined && is_editors_pick === undefined) {
    return NextResponse.json(
      { error: "Provide at least one of is_featured, is_editors_pick" },
      { status: 400 }
    );
  }

  const updated = await setAppFeaturing(slug, { is_featured, is_editors_pick });

  if (updated === null) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  return NextResponse.json({
    slug: updated.slug,
    is_featured: updated.is_featured,
    is_editors_pick: updated.is_editors_pick,
  });
}
