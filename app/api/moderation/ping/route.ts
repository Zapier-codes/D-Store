import { NextResponse } from "next/server";
import { applyModerationHeaders, requireModeratorRequest } from "@/lib/moderator-gate";

// Leaf 3.c.vi.zo — a "who am I" check behind the moderator gate. It is the
// smoke target for the gate and lets a moderator confirm their token works.
// It returns only the id the caller already sent, never a token or a digest.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireModeratorRequest(request);
  if (!gate.ok) return gate.response;
  return applyModerationHeaders(NextResponse.json({ moderator: gate.moderator }));
}
