/**
 * Web Push subscription validation — leaf `5.k.v.zi`.
 *
 * Pure functions: no I/O, no dependencies, no `node:` imports (so this is
 * safe to import from a route handler on either runtime). Every function
 * takes `unknown`, returns a typed result, and never throws — the input
 * is attacker-controlled JSON from an anonymous, unauthenticated route
 * (`5.k.vi.zi`), so "malformed" is an expected outcome, not an exception.
 *
 * What is validated, and why each check exists:
 *
 * - **Endpoint** — the push service's URL for one device. The server will
 *   later `POST` to it (`5.k.iii.zo`), so an unchecked endpoint is a
 *   server-side request forgery vector: anyone could subscribe with
 *   `https://internal-host/…` and have the server call it. The checks
 *   below block the obvious targets (IP literals, `localhost`, single-label
 *   and internal-suffix hosts, non-default ports, credentials). **They do
 *   not close the hole:** a public DNS name can still resolve to a private
 *   address, and a redirect can still point somewhere internal. The robust
 *   controls are a host allowlist of known push services and a sender that
 *   does not follow redirects — both are flagged for `5.k.iii.zo` in
 *   HANDOVER.md, deliberately not decided here because an allowlist is a
 *   compatibility decision (an unknown future push service would be
 *   refused), not a validation detail.
 * - **`p256dh`** — the subscription's P-256 public key, an uncompressed
 *   point: 65 bytes, first byte `0x04` (RFC 8291 / SEC1).
 * - **`auth`** — the 16-byte authentication secret (RFC 8291).
 *   Both are base64url **without padding**, exactly what
 *   `PushSubscription.toJSON()` produces. Padded or standard-alphabet
 *   base64 is refused rather than silently repaired, and so is a
 *   non-canonical encoding (non-zero trailing bits), so one key has one
 *   accepted spelling.
 *   This does NOT check that `p256dh` is a point on the curve — that needs
 *   `node:crypto`; an off-curve key fails at encryption time in the sender
 *   (`5.k.iii.zo`), which must treat that failure as "drop this row".
 * - **Slugs** — the apps a device wants alerts for. Same charset as
 *   Zealot's index (`^[a-z0-9]+(-[a-z0-9]+)*$`), de-duplicated in first-seen
 *   order, capped so one request cannot write an unbounded number of rows.
 *
 * The endpoint string is returned exactly as received, not normalized:
 * `push_subscription.endpoint` is a unique text key (`5.k.i.zi`), and
 * unsubscribe (`validateEndpoint` again) must match what subscribe stored.
 * Browsers hand back the same string every time for one subscription.
 */

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ValidPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Real push-service endpoints are a few hundred characters; this is generous, not tight. */
export const MAX_ENDPOINT_LENGTH = 2048;
/** Encoded length of 65 bytes / 16 bytes as unpadded base64url. */
export const P256DH_ENCODED_LENGTH = 87;
export const AUTH_ENCODED_LENGTH = 22;
/**
 * Most a single request may name. A saved-apps list is a handful in
 * practice; this bounds work and rows per request, it is not a product
 * limit anyone should hit. Over the cap is refused, not truncated, so a
 * client never believes it is subscribed to slugs that were dropped.
 */
export const MAX_SLUGS = 200;
export const MAX_SLUG_LENGTH = 100;

/** Zealot's own rule (`catalog_index_v2.schema.json`, `app.slug`). Aptoide's `uname` is used as a slug verbatim; all 12 ingested today match. */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BASE64URL_CHARS = /^[A-Za-z0-9_-]+$/;
const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;
const CONTROL_OR_SPACE = /[\s\u0000-\u001f\u007f]/;
/** Hostname endings that are never a public push service. */
const INTERNAL_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa", ".intranet", ".corp"];

function fail<T>(error: string): Validation<T> {
  return { ok: false, error };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Decodes unpadded base64url. Returns `null` for anything that is not a
 * canonical encoding: wrong alphabet, an impossible length, or non-zero
 * padding bits in the last character.
 */
export function decodeBase64Url(s: string): Uint8Array | null {
  if (!BASE64URL_CHARS.test(s) || s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 6) / 8));
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < s.length; i++) {
    acc = (acc << 6) | BASE64URL_ALPHABET.indexOf(s[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
      acc &= (1 << bits) - 1;
    }
  }
  return acc === 0 ? out : null;
}

/** An `https` push-service endpoint. Returns the string unchanged on success. */
export function validateEndpoint(input: unknown): Validation<string> {
  try {
    if (typeof input !== "string") return fail("endpoint must be a string");
    if (input.length === 0 || input.length > MAX_ENDPOINT_LENGTH) {
      return fail(`endpoint must be 1-${MAX_ENDPOINT_LENGTH} characters`);
    }
    if (CONTROL_OR_SPACE.test(input)) return fail("endpoint must not contain whitespace or control characters");
    // Literal, case-sensitive prefix: also what the table's `like 'https://%'` check requires.
    if (!input.startsWith("https://")) return fail("endpoint must be an https URL");
    if (input.includes("#")) return fail("endpoint must not contain a fragment");

    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return fail("endpoint is not a valid URL");
    }
    if (url.protocol !== "https:") return fail("endpoint must be an https URL");
    if (url.username !== "" || url.password !== "") return fail("endpoint must not contain credentials");
    if (url.port !== "") return fail("endpoint must use the default https port");

    // The URL parser has already lowercased the host and rewritten odd IPv4
    // spellings (0x7f.1, 2130706433, 127.1) to dotted decimal.
    const host = url.hostname.replace(/\.$/, "");
    if (host === "") return fail("endpoint has no host");
    if (host.startsWith("[") || IPV4_LITERAL.test(host)) return fail("endpoint host must be a name, not an IP address");
    if (!host.includes(".")) return fail("endpoint host must be a fully qualified name");
    if (host === "localhost" || INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
      return fail("endpoint host is not a public push service");
    }
    return { ok: true, value: input };
  } catch {
    return fail("endpoint is invalid");
  }
}

/** The subscription's `p256dh` key: 65-byte uncompressed P-256 point as unpadded base64url. */
export function validateP256dh(input: unknown): Validation<string> {
  try {
    if (typeof input !== "string") return fail("p256dh must be a string");
    if (input.length !== P256DH_ENCODED_LENGTH) return fail("p256dh has the wrong length");
    const bytes = decodeBase64Url(input);
    if (!bytes || bytes.length !== 65) return fail("p256dh is not valid unpadded base64url");
    if (bytes[0] !== 0x04) return fail("p256dh is not an uncompressed P-256 point");
    return { ok: true, value: input };
  } catch {
    return fail("p256dh is invalid");
  }
}

/** The subscription's `auth` secret: 16 bytes as unpadded base64url. */
export function validateAuth(input: unknown): Validation<string> {
  try {
    if (typeof input !== "string") return fail("auth must be a string");
    if (input.length !== AUTH_ENCODED_LENGTH) return fail("auth has the wrong length");
    const bytes = decodeBase64Url(input);
    if (!bytes || bytes.length !== 16) return fail("auth is not valid unpadded base64url");
    return { ok: true, value: input };
  } catch {
    return fail("auth is invalid");
  }
}

/**
 * A subscription in the shape the browser standard already defines —
 * `PushSubscription.toJSON()`: `{ endpoint, expirationTime?, keys: { p256dh, auth } }`.
 * Other fields (`expirationTime`) are ignored, not stored. The request
 * envelope around this (`{ subscription, slugs }` or otherwise) belongs to
 * the route handler, not this module.
 */
export function validatePushSubscription(input: unknown): Validation<ValidPushSubscription> {
  try {
    if (!isPlainObject(input)) return fail("subscription must be an object");
    const endpoint = validateEndpoint(input.endpoint);
    if (!endpoint.ok) return endpoint;
    if (!isPlainObject(input.keys)) return fail("subscription.keys must be an object");
    const p256dh = validateP256dh(input.keys.p256dh);
    if (!p256dh.ok) return p256dh;
    const auth = validateAuth(input.keys.auth);
    if (!auth.ok) return auth;
    return { ok: true, value: { endpoint: endpoint.value, p256dh: p256dh.value, auth: auth.value } };
  } catch {
    return fail("subscription is invalid");
  }
}

/**
 * A list of catalog slugs. An empty list is valid (subscribed to nothing).
 * Any non-string, over-long or badly-shaped entry refuses the whole list —
 * a hostile request is not partially honored. Duplicates are collapsed,
 * keeping first-seen order.
 */
export function validateSlugs(input: unknown): Validation<string[]> {
  try {
    if (!Array.isArray(input)) return fail("slugs must be an array");
    // Bound the work before touching any element.
    if (input.length > MAX_SLUGS) return fail(`at most ${MAX_SLUGS} slugs are allowed`);
    const seen = new Set<string>();
    const out: string[] = [];
    for (let i = 0; i < input.length; i++) {
      const slug: unknown = input[i];
      if (typeof slug !== "string") return fail("every slug must be a string");
      if (slug.length === 0 || slug.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(slug)) {
        return fail("a slug is not in the catalog slug format");
      }
      if (!seen.has(slug)) {
        seen.add(slug);
        out.push(slug);
      }
    }
    return { ok: true, value: out };
  } catch {
    return fail("slugs are invalid");
  }
}
