import { NextResponse } from "next/server";
import { checkRateLimit } from "../../../../../../lib/rate-limit";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug) return new Response("Bad Request", { status: 400 });

  const allowed = await checkRateLimit(`report:${slug}`, 3, 3600);
  if (!allowed) return new Response("Too Many Requests", { status: 429 });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: true });
  }

  try {
    const body = await request.json();
    const reason = typeof body.reason === "string" ? body.reason.slice(0, 100) : null;
    const details = typeof body.details === "string" ? body.details.slice(0, 2000) : null;
    if (!reason) return new Response("Bad Request", { status: 400 });

    const res = await fetch(`${SUPABASE_URL}/rest/v1/report_flag`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ application_id: slug, reason, details, status: "open" }),
    });

    if (!res.ok) return new Response("Internal Server Error", { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return new Response("Internal Server Error", { status: 500 });
  }
}
