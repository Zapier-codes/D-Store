import { NextResponse } from "next/server";
import { incrementInstallCount } from "@/lib/catalog";

/**
 * Install-count increment endpoint — leaf `3.b.i.zi` (Metrics
 * Pipeline, Counters). Resolves the "app-native counters" decision in
 * HANDOVER.md's Section 0: this is the storefront's own click event,
 * fired by `InstallButton` when a dummy install completes, not a
 * count derived from Telegram/GitHub distribution logs.
 *
 * POST-only, no request body — the slug comes from the route segment,
 * matching every other app-scoped read in `lib/catalog.ts`
 * (`getAppBySlug`). `incrementInstallCount` does the actual mutation
 * and stays the seam that gets swapped for a real Supabase call once
 * `5.f.i` lands; this route handler doesn't know or care which one is
 * behind it.
 *
 * Anonymous and idempotent-adjacent by design, same posture this
 * repo's other anonymous write paths (`Review`, `1.a.iii.zi`;
 * `ReportFlag`, `1.a.iii.zo`) already take: no auth, no dedup — a
 * user re-triggering their own already-simulated install would
 * double count, same as a real Play Store re-install bump would.
 * Fingerprint/rate-limit throttling for this exact class of counter
 * is already its own separate leaf (`5.d.ii.zi`) further down the
 * roadmap, not something to half-build here.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const newCount = await incrementInstallCount(slug);

  if (newCount === null) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  return NextResponse.json({ slug, install_count: newCount });
}
