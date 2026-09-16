import { NextResponse } from "next/server";
import { updateSponsoredSlot, deleteSponsoredSlot } from "@/lib/catalog";

/**
 * Single-slot edit/remove endpoint — leaf `3.c.i.zo`, the `[id]`
 * counterpart to `app/api/admin/sponsored/route.ts`'s list/create.
 *
 * PATCH accepts a partial `{ name?, summary?, start_date?, end_date? }`
 * body — any subset, matching `updateSponsoredSlot`'s signature in
 * `lib/catalog.ts` — so the admin UI can edit just the schedule or just
 * the creative without resending the other. DELETE removes the slot
 * outright, for a booking that never should have been scheduled rather
 * than one whose dates need adjusting.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
  const updates: { name?: string; summary?: string; start_date?: string; end_date?: string } = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    updates.name = name;
  }
  if (summary !== undefined) {
    if (typeof summary !== "string" || summary.trim() === "") {
      return NextResponse.json({ error: "summary must be a non-empty string" }, { status: 400 });
    }
    updates.summary = summary;
  }
  if (start_date !== undefined) {
    if (typeof start_date !== "string" || !DATE_RE.test(start_date)) {
      return NextResponse.json({ error: "start_date must be a YYYY-MM-DD string" }, { status: 400 });
    }
    updates.start_date = start_date;
  }
  if (end_date !== undefined) {
    if (typeof end_date !== "string" || !DATE_RE.test(end_date)) {
      return NextResponse.json({ error: "end_date must be a YYYY-MM-DD string" }, { status: 400 });
    }
    updates.end_date = end_date;
  }
  if (
    updates.start_date !== undefined &&
    updates.end_date !== undefined &&
    updates.end_date < updates.start_date
  ) {
    return NextResponse.json({ error: "end_date must not be before start_date" }, { status: 400 });
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Provide at least one of name, summary, start_date, end_date" },
      { status: 400 }
    );
  }

  const updated = await updateSponsoredSlot(id, updates);
  if (updated === null) {
    return NextResponse.json({ error: "Sponsored slot not found" }, { status: 404 });
  }
  return NextResponse.json({ slot: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = await deleteSponsoredSlot(id);
  if (!deleted) {
    return NextResponse.json({ error: "Sponsored slot not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
