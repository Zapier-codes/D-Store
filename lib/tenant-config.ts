/**
 * Leaf `6.b.ii.zi` — TenantConfig v1 (the shared cross-repo contract:
 * `Storeapp/spec/tenant-config-schema.md` + `tenant-config.schema.json`, leaf `1.c.i.zi`),
 * plus the pure, I/O-free logic for resolving a request host to a tenant.
 *
 * Fetching/verifying the signed registry these records arrive in lives in
 * `lib/tenant-registry.ts`; reading the current request's tenant lives in `lib/tenant.ts`.
 *
 * **The default tenant is compiled in, never fetched** — same posture Storeapp's
 * `TenantConfig.kt` takes (`1.c.ii.zi`): it reproduces today's D-Store exactly, so an
 * unset/failed/empty registry, an unknown host, `localhost`, and every preview deployment
 * all get today's behavior unchanged. A registry record can never override it (see
 * `parseTenantRegistry`).
 */

import { isExpired } from "./sources/zealot-trust";
import { normalizeHost } from "./tenant-host";

export { normalizeHost, TENANT_HOST_HEADER } from "./tenant-host";

export const TENANT_CONFIG_SCHEMA_VERSION = 1;
export const DEFAULT_TENANT_ID = "default";

export interface TenantBranding {
  display_name: string;
  primary_color_hex: string;
  logo_url?: string;
  logo_sha256?: string;
}

/** Field names/shape match `tenant-config.schema.json` exactly (snake_case, as on the wire). */
export interface TenantConfig {
  schema_version: number;
  tenant_id: string;
  generated_at: string;
  sequence: number;
  expires_at: string;
  branding: TenantBranding;
  cdn_base: string;
  /**
   * `6.b.ii.zo` — this tenant's signed catalog index (the per-tenant equivalent of
   * `ZEALOT_CATALOG_INDEX_BASE_URL`). `null`/absent/`""` = "no first-party Zealot source
   * configured for this tenant" (spec: nothing to fetch, not an error). Read via
   * `catalogScopeForTenant` in `lib/sources/zealot.ts`, never directly.
   */
  catalog_index_base_url?: string | null;
  domains: string[];
  is_default_tenant: boolean;
}

/**
 * The seed tenant. `display_name` is D-Store's existing brand. `primary_color_hex` is the
 * dark theme's existing accent (`--color-accent` in `app/globals.css`) for completeness only:
 * `brandingCss` deliberately emits nothing for this tenant, so the two themes keep their own
 * separately-tuned accents (gold / cobalt) exactly as today.
 */
export const DEFAULT_TENANT: TenantConfig = {
  schema_version: TENANT_CONFIG_SCHEMA_VERSION,
  tenant_id: DEFAULT_TENANT_ID,
  generated_at: "1970-01-01T00:00:00Z",
  sequence: 0,
  expires_at: "9999-12-31T23:59:59Z",
  branding: { display_name: "D-Store", primary_color_hex: "#d4af37" },
  cdn_base: "https://nikhilkain.github.io/appstore-metadata",
  domains: [],
  is_default_tenant: true,
};

// --- Validation ------------------------------------------------------------

const TENANT_ID_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validates one record's required fields and value shapes. Unknown extra fields are ignored
 * (the spec's additive-only policy: a v1 reader tolerates additive fields it doesn't need).
 * Returns a cleaned copy, or `null` — never a partially-valid record.
 */
export function validateTenantRecord(raw: unknown): TenantConfig | null {
  if (!isRecord(raw)) return null;
  if (raw.schema_version !== TENANT_CONFIG_SCHEMA_VERSION) return null;
  const { tenant_id, generated_at, sequence, expires_at, branding, cdn_base, domains } = raw;
  if (typeof tenant_id !== "string" || !TENANT_ID_PATTERN.test(tenant_id)) return null;
  if (typeof generated_at !== "string" || Number.isNaN(Date.parse(generated_at))) return null;
  if (typeof sequence !== "number" || !Number.isInteger(sequence) || sequence < 0) return null;
  if (typeof expires_at !== "string" || Number.isNaN(Date.parse(expires_at))) return null;
  if (typeof cdn_base !== "string" || !cdn_base.startsWith("https://")) return null;
  if (!isRecord(branding)) return null;
  if (typeof branding.display_name !== "string" || branding.display_name.trim() === "" || branding.display_name.length > 60) return null;
  if (typeof branding.primary_color_hex !== "string" || !HEX_COLOR_PATTERN.test(branding.primary_color_hex)) return null;
  const cleanDomains: string[] = [];
  if (domains !== undefined) {
    if (!Array.isArray(domains)) return null;
    for (const d of domains) {
      const h = typeof d === "string" ? normalizeHost(d) : null;
      if (!h) return null; // one malformed domain rejects the record, not just that entry
      cleanDomains.push(h);
    }
  }
  const catalog = raw.catalog_index_base_url;
  // The spec types this `string | null` (default null): a record that says "no catalog for this tenant" with an
  // explicit null is valid, and must not get the whole tenant record dropped.
  if (catalog !== undefined && catalog !== null && (typeof catalog !== "string" || (catalog !== "" && !catalog.startsWith("https://")))) return null;

  return {
    schema_version: TENANT_CONFIG_SCHEMA_VERSION,
    tenant_id,
    generated_at,
    sequence,
    expires_at,
    branding: {
      display_name: branding.display_name.trim(),
      primary_color_hex: branding.primary_color_hex,
      ...(typeof branding.logo_url === "string" ? { logo_url: branding.logo_url } : {}),
      ...(typeof branding.logo_sha256 === "string" ? { logo_sha256: branding.logo_sha256 } : {}),
    },
    cdn_base,
    ...(typeof catalog === "string" || catalog === null ? { catalog_index_base_url: catalog } : {}),
    domains: cleanDomains,
    is_default_tenant: false, // never taken from the wire: informational-only flag, and only the compiled-in seed is the default
  };
}

/** The signed registry envelope this reader consumes (a proposed publish shape — see `lib/tenant-registry.ts`). */
export interface TenantRegistry {
  schema_version: number;
  sequence: number;
  generated_at: string;
  expires_at: string;
  tenants: TenantConfig[];
}

/**
 * Parses + validates an already signature-verified registry document. `null` for a bad
 * envelope (wrong `schema_version`, missing anti-rollback fields). Individual bad, expired,
 * or `default`-claiming records are dropped rather than failing the whole registry, so one
 * publisher bug can't take every other tenant offline.
 */
export function parseTenantRegistry(text: string, now: Date = new Date()): TenantRegistry | null {
  let doc: unknown;
  try { doc = JSON.parse(text); } catch { return null; }
  if (!isRecord(doc)) return null;
  if (doc.schema_version !== TENANT_CONFIG_SCHEMA_VERSION) return null;
  if (typeof doc.sequence !== "number" || !Number.isInteger(doc.sequence) || doc.sequence < 0) return null;
  if (typeof doc.generated_at !== "string" || Number.isNaN(Date.parse(doc.generated_at))) return null;
  if (typeof doc.expires_at !== "string" || Number.isNaN(Date.parse(doc.expires_at))) return null;
  if (!Array.isArray(doc.tenants)) return null;

  const seen = new Set<string>();
  const tenants: TenantConfig[] = [];
  for (const raw of doc.tenants) {
    const t = validateTenantRecord(raw);
    if (!t) continue;
    if (t.tenant_id === DEFAULT_TENANT_ID) continue; // the seed is compiled in; a fetched record never replaces it
    if (isExpired(t.expires_at, now)) continue;
    if (seen.has(t.tenant_id)) continue; // duplicate id: keep the first, ignore the rest
    seen.add(t.tenant_id);
    tenants.push(t);
  }
  return {
    schema_version: TENANT_CONFIG_SCHEMA_VERSION,
    sequence: doc.sequence,
    generated_at: doc.generated_at,
    expires_at: doc.expires_at,
    tenants,
  };
}

// --- Host -> tenant ---------------------------------------------------------

/**
 * Resolves a normalized host to a tenant. Order: (1) exact match against a tenant's `domains`;
 * (2) if `baseDomain` is set, `<tenant_id>.<baseDomain>` (single label — the `tenant_id` rule
 * exists precisely so it's always usable as a subdomain); (3) the default tenant. Never returns
 * `null` and never 404s: an unknown host is served as the default tenant.
 *
 * **A domain claimed by two different tenants resolves to neither** (falls through) rather than
 * to whichever record happens to be listed first — order in a registry must never decide who
 * gets a contested host.
 */
export function findTenantForHost(host: string | null, tenants: readonly TenantConfig[], baseDomain?: string | null): TenantConfig {
  if (!host) return DEFAULT_TENANT;
  const owners = tenants.filter((t) => t.domains.includes(host));
  if (owners.length === 1) return owners[0];
  if (owners.length > 1) return DEFAULT_TENANT;

  const base = normalizeHost(baseDomain ?? null);
  if (base && host.endsWith(`.${base}`)) {
    const label = host.slice(0, -(base.length + 1));
    if (!label.includes(".")) {
      const byId = tenants.find((t) => t.tenant_id === label);
      if (byId) return byId;
    }
  }
  return DEFAULT_TENANT;
}

// --- Branding -> CSS --------------------------------------------------------

function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.max(0, Math.round(((n >> shift) & 0xff) * (1 - amount)));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * CSS overriding the accent tokens for a non-default tenant, or `null` for the default tenant
 * (leave both themes' own tuned accents alone). Only ever interpolates a value that passed
 * `HEX_COLOR_PATTERN`, so it can't carry anything but a hex color. `html[data-theme]` (0,1,1)
 * outranks the themes' own `[data-theme="…"]` (0,1,0) blocks in `app/globals.css`.
 *
 * Flagged: the tenant's color is applied as-is over both themes — no WCAG contrast check
 * against either theme's background, so a low-contrast brand color can fail AA.
 */
export function brandingCss(tenant: TenantConfig): string | null {
  if (tenant.tenant_id === DEFAULT_TENANT_ID) return null;
  const hex = tenant.branding.primary_color_hex;
  if (!HEX_COLOR_PATTERN.test(hex)) return null;
  return `html[data-theme]{--color-accent:${hex};--color-accent-strong:${darken(hex, 0.15)};}`;
}
