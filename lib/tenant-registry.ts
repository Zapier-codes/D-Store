/**
 * Leaf `6.b.ii.zi` — fetch + verify + cache the signed tenant registry.
 *
 * **The publish shape below is a PROPOSAL, not an agreed contract.** `Storeapp/spec/
 * tenant-config-schema.md` fixes the per-tenant *record*; it says nothing about how a reader
 * finds the record for a given host, and Zealot's Task 37b/37c (the publisher) isn't built.
 * A web reader can't ask "which tenant owns this host" of a per-tenant fetch endpoint, so this
 * reads one signed document listing every tenant:
 *
 *   GET $TENANT_REGISTRY_URL        -> { schema_version:1, sequence, generated_at, expires_at, tenants:[TenantConfig…] }
 *   GET $TENANT_REGISTRY_URL + ".sig" -> detached Ed25519 signature (base64) over the exact bytes of the first
 *
 * (the `.sig` sidecar is the same convention Storeapp's `TenantConfig.kt` invented in `1.c.ii.zo`).
 * Trust is the catalog index's, reused verbatim from `lib/sources/zealot-trust.ts`: the same
 * pinned key(s) — one signer for both documents — plus expiry and anti-rollback. Same fail-safe
 * as `lib/sources/zealot.ts`: any failure serves the last registry this server already verified;
 * nothing ever verified means no extra tenants, i.e. everyone gets the default tenant.
 *
 * `TENANT_REGISTRY_URL` unset = "not configured yet" (not an error): default tenant only.
 * `TENANT_BASE_DOMAIN` (optional) enables `<tenant_id>.<base>` subdomain resolution.
 */

import { verifySignature, isRollback, isExpired, type IndexState } from "./sources/zealot-trust";
import { readJsonFile, writeJsonFile } from "./sources/zealot";
import { parseTenantRegistry, type TenantConfig, type TenantRegistry } from "./tenant-config";

const STATE_FILE = ["storage", "downloads", "tenant-registry-state.json"];
const CACHE_FILE = ["storage", "downloads", "tenant-registry-cache.json"];

const FRESH_MS = 5 * 60 * 1000;   // a successful resolution is reused this long
const RETRY_MS = 60 * 1000;       // after a failed fetch, don't retry per-request

let memo: { at: number; ttl: number; tenants: TenantConfig[] } | null = null;

/** Fetch + fully verify one candidate. Commits state/cache only on full success. */
export async function fetchAndVerifyRegistry(url: string): Promise<TenantRegistry | null> {
  let text: string;
  let sig: string;
  try {
    const [a, b] = await Promise.all([
      fetch(url, { cache: "no-store" }),
      fetch(`${url}.sig`, { cache: "no-store" }),
    ]);
    if (!a.ok || !b.ok) return null;
    text = await a.text();
    sig = (await b.text()).trim();
  } catch {
    return null;
  }
  return verifyRegistryText(text, sig);
}

/** The trust gauntlet, separated from I/O so it can be exercised directly: signature → parse/schema → expiry → anti-rollback. */
export async function verifyRegistryText(text: string, signature: string): Promise<TenantRegistry | null> {
  if (!(await verifySignature(text, signature))) return null;
  const reg = parseTenantRegistry(text);
  if (!reg) return null;
  if (isExpired(reg.expires_at)) return null;
  const last = await readJsonFile<IndexState>(STATE_FILE);
  if (isRollback({ sequence: reg.sequence, generatedAt: reg.generated_at }, last)) return null;
  return reg;
}

async function commit(reg: TenantRegistry): Promise<void> {
  await writeJsonFile(STATE_FILE, { sequence: reg.sequence, generatedAt: reg.generated_at } satisfies IndexState);
  await writeJsonFile(CACHE_FILE, reg);
}

/** Verified tenants (never includes the default tenant). Memoized per process; never throws. */
export async function getTenantRegistry(): Promise<TenantConfig[]> {
  const now = Date.now();
  if (memo && now - memo.at < memo.ttl) return memo.tenants;

  const url = process.env.TENANT_REGISTRY_URL?.trim();
  let tenants: TenantConfig[] | null = null;
  let ttl = FRESH_MS;

  if (url && url.startsWith("https://")) {
    const reg = await fetchAndVerifyRegistry(url);
    if (reg) {
      await commit(reg);
      tenants = reg.tenants;
    } else {
      ttl = RETRY_MS;
    }
  }
  if (!tenants) {
    // Stale-but-once-verified beats no tenants (same tradeoff as `createZealotSource`'s note).
    // Re-parsed on read: per-record expiry is enforced again, and a hand-edited cache file can't
    // smuggle in a record `validateTenantRecord` would reject.
    const cached = await readJsonFile<unknown>(CACHE_FILE);
    tenants = cached ? (parseTenantRegistry(JSON.stringify(cached))?.tenants ?? []) : [];
  }
  memo = { at: now, ttl, tenants };
  return tenants;
}

/** Test seam: drops the in-process memo. */
export function resetTenantRegistryMemo(): void { memo = null; }
