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
import { findTenantForHost, normalizeHost, parseHostList, TENANT_HOST_HEADER, type TenantConfig } from "./tenant-config";
import { getTenantRegistry } from "./tenant-registry";

/** The normalized host of the current request (the one `getCurrentTenant` resolves), `null` when it is not a plain hostname. */
export const getCurrentHost = cache(async (): Promise<string | null> => {
  const h = await headers();
  return normalizeHost(h.get(TENANT_HOST_HEADER) ?? h.get("host"));
});

export const getCurrentTenant = cache(async (): Promise<TenantConfig> => {
  const host = await getCurrentHost();
  const tenants = await getTenantRegistry();
  // f.vii: `TENANT_RESERVED_HOSTS` = the hosts no tenant record may claim (the operator's primary host(s)).
  return findTenantForHost(host, tenants, process.env.TENANT_BASE_DOMAIN, parseHostList(process.env.TENANT_RESERVED_HOSTS));
});
