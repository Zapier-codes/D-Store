import { NextResponse } from "next/server";
import { isStatsStoreConfigured, readStoreStats } from "../../../../lib/stats-store";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

function checkStatsAuth(req: Request): boolean {
  const token = process.env.STATS_READ_TOKEN;
  const authHeader = req.headers.get("authorization");
  
  // Fail closed if token is missing, too short, or no auth header
  if (!token || token.length < 32 || !authHeader) return false;
  
  const presented = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (presented.length < 32) return false;
  
  // Constant-time comparison
  const a = crypto.createHash("sha256").update(token).digest();
  const b = crypto.createHash("sha256").update(presented).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!checkStatsAuth(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  
  if (!isStatsStoreConfigured()) {
    return new Response("Service Unavailable", { status: 503 });
  }
  
  const stats = await readStoreStats();
  if (stats === null) {
    return new Response("Bad Gateway", { status: 502 });
  }
  
  return NextResponse.json(stats, { headers: { "Cache-Control": "no-store" } });
}
