/**
 * Leaf `6.b.ii.zi` — the current request's tenant, for Server Components / `generateMetadata`.
 *
 * Why this isn't resolved inside `middleware.ts` itself, despite the leaf text: this repo is on
 * Next 15.0, where middleware only runs on the Edge runtime, and the trust check
 * (`lib/sources/zealot-trust.ts`) needs `node:crypto` for Ed25519 plus the filesystem for its
 * anti-rollback state. So middleware does the edge-safe half (normalize `Host`, strip any
 * client-supplied copy of the header, forward the clean value) and this does the verified
 * lookup on the Node side, once per request.
 */

import { cache } from "react";
import { headers } from "next/headers";
import { findTenantForHost, normalizeHost, TENANT_HOST_HEADER, type TenantConfig } from "./tenant-config";
import { getTenantRegistry } from "./tenant-registry";

export const getCurrentTenant = cache(async (): Promise<TenantConfig> => {
  const h = await headers();
  const host = normalizeHost(h.get(TENANT_HOST_HEADER) ?? h.get("host"));
  const tenants = await getTenantRegistry();
  return findTenantForHost(host, tenants, process.env.TENANT_BASE_DOMAIN);
});
