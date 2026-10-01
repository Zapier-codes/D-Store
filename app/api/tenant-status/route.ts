import { NextResponse } from "next/server";
import { getCurrentHost, getCurrentTenant } from "@/lib/tenant";
import { DEFAULT_TENANT_ID } from "@/lib/tenant-config";

/**
 * Leaf `f.vii` (Storeapp Track f) — which tenant does THIS host resolve to. A website-type request
 * has no build and no artifact, so "delivered" means the tenant's host answers as that tenant; the
 * operator or `distr` can fetch `https://<host>/api/tenant-status` and compare `tenant_id` with the
 * one it provisioned. Answers only what any visitor to the host already sees (the host and the id
 * its own branding is served under), never the record, the registry or the other tenants, and
 * always `200`: an unknown host is simply the default tenant. `GET` only.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const host = await getCurrentHost();
  const tenant = await getCurrentTenant();
  return NextResponse.json(
    { host, tenant_id: tenant.tenant_id, is_default_tenant: tenant.tenant_id === DEFAULT_TENANT_ID },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
  );
}
