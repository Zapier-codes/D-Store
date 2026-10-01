import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TENANT,
  findTenantForHost,
  isReservedHost,
  parseHostList,
  tenantLiveHost,
  type TenantConfig,
} from "../lib/tenant-config";

// Leaf f.vii (Storeapp Track f).
const tenant = (id: string, domains: string[] = []): TenantConfig => ({
  ...DEFAULT_TENANT,
  tenant_id: id,
  branding: { display_name: id, primary_color_hex: "#112233" },
  domains,
  is_default_tenant: false,
});

test("parseHostList normalizes, splits on commas and spaces, and drops junk", () => {
  const set = parseHostList("Store.Example.com:443, www.example.com  [::1] ,, bad_host");
  assert.deepEqual([...set].sort(), ["store.example.com", "www.example.com"]);
  assert.equal(parseHostList(undefined).size, 0);
  assert.equal(parseHostList("").size, 0);
});

test("the base domain apex and its www form are reserved without being listed", () => {
  assert.equal(isReservedHost("example.com", "example.com"), true);
  assert.equal(isReservedHost("www.example.com", "example.com"), true);
  assert.equal(isReservedHost("acme-1a2b3c.example.com", "example.com"), false);
  assert.equal(isReservedHost("example.com", null), false);
});

test("a listed reserved host is reserved, an unlisted one is not", () => {
  const reserved = parseHostList("store.example.org");
  assert.equal(isReservedHost("store.example.org", null, reserved), true);
  assert.equal(isReservedHost("other.example.org", null, reserved), false);
});

test("a record that lists a reserved host as its domain does not take it over", () => {
  const hijack = tenant("evil-aaaaaa", ["store.example.org"]);
  const reserved = parseHostList("store.example.org");
  assert.equal(findTenantForHost("store.example.org", [hijack], null, reserved).tenant_id, "default");
  // the same record WITHOUT the guard would have won, which is the point of it
  assert.equal(findTenantForHost("store.example.org", [hijack], null).tenant_id, "evil-aaaaaa");
});

test("a record that lists the base domain apex does not take it over", () => {
  const hijack = tenant("evil-aaaaaa", ["example.com", "www.example.com"]);
  assert.equal(findTenantForHost("example.com", [hijack], "example.com").tenant_id, "default");
  assert.equal(findTenantForHost("www.example.com", [hijack], "example.com").tenant_id, "default");
});

test("a claimable custom domain and the default subdomain both still resolve", () => {
  const t = tenant("acme-1a2b3c", ["shop.acme.example"]);
  const reserved = parseHostList("store.example.org");
  assert.equal(findTenantForHost("shop.acme.example", [t], "example.com", reserved).tenant_id, "acme-1a2b3c");
  assert.equal(findTenantForHost("acme-1a2b3c.example.com", [t], "example.com", reserved).tenant_id, "acme-1a2b3c");
  assert.equal(findTenantForHost("nobody.example.com", [t], "example.com", reserved).tenant_id, "default");
});

test("the live host is the first claimable custom domain, else the subdomain, else null", () => {
  const reserved = parseHostList("store.example.org");
  assert.equal(tenantLiveHost(tenant("acme-1a2b3c", ["store.example.org", "shop.acme.example"]), "example.com", reserved), "shop.acme.example");
  assert.equal(tenantLiveHost(tenant("acme-1a2b3c"), "example.com"), "acme-1a2b3c.example.com");
  assert.equal(tenantLiveHost(tenant("acme-1a2b3c"), null), null);
  assert.equal(tenantLiveHost(tenant("acme-1a2b3c", ["example.com"]), null), "example.com");
  assert.equal(tenantLiveHost(DEFAULT_TENANT, "example.com"), null);
});
