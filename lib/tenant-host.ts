/**
 * Leaf `6.b.ii.zi` — request-host normalization, kept in its own import-free file so
 * `middleware.ts` (Edge runtime) can use it without pulling `lib/tenant-config.ts`'s
 * dependency on `lib/sources/zealot-trust.ts` into the Edge bundle.
 */

/** Request header middleware sets (after deleting any client-supplied copy) and server code reads. */
export const TENANT_HOST_HEADER = "x-tenant-host";

const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/**
 * Lowercases, strips a `:port` and a trailing dot, and returns `null` for anything that isn't
 * a plain DNS hostname (IPv6 literals, empty, junk) — a value that can't be a tenant's domain
 * is never worth resolving, and `null` falls through to the default tenant.
 */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let host = raw.trim().toLowerCase();
  if (host.startsWith("[")) return null; // IPv6 literal
  const colon = host.indexOf(":");
  if (colon !== -1) host = host.slice(0, colon);
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.length === 0 || host.length > 253) return null;
  return HOST_PATTERN.test(host) ? host : null;
}
