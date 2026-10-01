/**
 * Authentication for the Web Push dispatch route — leaf `5.k.xii.zi`.
 *
 * `POST /api/push/dispatch` (`5.k.xiii.zi`) is called by the operator's own
 * automation, not by visitors, so it is gated by one shared secret held in an
 * environment variable:
 *
 *   PUSH_DISPATCH_SECRET   required, at least 32 characters, no whitespace
 *
 * Header format (decided here): `Authorization: Bearer <secret>`. The scheme
 * name is case-insensitive, as HTTP requires; exactly one space separates it
 * from the token, and the token is a single run of non-whitespace characters.
 *
 * Fails CLOSED. With the secret unset, too short, or containing whitespace,
 * every request is `503` and **nothing is compared** — so deploying the route
 * before the secret exists exposes nothing, and `next build` and `next start`
 * need no configuration. A whitespace-bearing secret (typically a trailing
 * newline pasted into a dashboard) is treated as misconfigured rather than
 * trimmed: trimming would quietly accept a value the operator never chose,
 * and leaving it would make a secret no header can ever match, so `503` says
 * "fix the configuration" instead of a confusing permanent `401`.
 *
 * Otherwise both sides are hashed with SHA-256 (Web Crypto) and the digests
 * are compared byte by byte with no early exit, the pattern of
 * `timingSafeEqual` in `lib/admin-auth.ts`. Hashing first makes the compared
 * values equal length whatever was sent, so length is not a side channel. A
 * missing, malformed or wrong header is `401`, and the three are
 * indistinguishable: the same status, and the same work (both digests are
 * always computed, even when there is no usable header).
 *
 * Nothing here logs. The header value and the secret never appear in a
 * result, an error or a `console` call. There is no `WWW-Authenticate`
 * challenge because this is machine-to-machine; the route can add one if it
 * wants.
 *
 * Contract:
 * - Never throws. A failure of Web Crypto itself is `503` (fail closed: the
 *   secret could not be checked).
 * - Nothing runs at import time; the environment is read per call.
 * - Uses only Web APIs (`crypto.subtle`, `TextEncoder`), so it runs in the
 *   Node and Edge runtimes alike.
 *
 * Not covered: throttling. A shared secret has no brute-force protection of
 * its own, which is what the length floor is for (a 32-character random value
 * is out of reach). `lib/rate-limit.ts` (`5.k.vi.zo`) exists, but these two
 * token-gated routes are deliberately not wired to it: the cost of a guess is
 * a constant-time compare, and a limiter outage must never block the cron.
 */

export const PUSH_DISPATCH_SECRET_MIN_LENGTH = 32;

export type DispatchAuthResult = { ok: true } | { ok: false; status: 401 | 503 };

const DENIED_401: DispatchAuthResult = { ok: false, status: 401 };
const DENIED_503: DispatchAuthResult = { ok: false, status: 503 };

/**
 * Compare two byte arrays without stopping at the first difference: every
 * index is visited whatever the earlier ones held. Arrays of different length
 * are unequal (the caller only ever passes two SHA-256 digests, so this is a
 * backstop). Exported so a test can prove the no-short-circuit property.
 */
export function bytesEqualConstantTime(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

/** The token from `Bearer <token>`, or `null` for anything else. */
function parseBearer(header: string | null): string | null {
  if (typeof header !== "string") return null;
  const match = /^bearer ([^\s]+)$/i.exec(header);
  return match ? match[1] : null;
}

/** The configured secret, or `null` when unset or unusable. */
function readSecret(env: Readonly<Record<string, string | undefined>>): string | null {
  const secret = env.PUSH_DISPATCH_SECRET;
  if (typeof secret !== "string") return null;
  if (secret.length < PUSH_DISPATCH_SECRET_MIN_LENGTH) return null;
  if (/\s/.test(secret)) return null;
  return secret;
}

/**
 * Decide whether a dispatch request may proceed.
 *
 * `headers` is anything with a `get(name)` — a `Headers`, or a `Request`'s
 * `headers`. `env` defaults to `process.env` and is a parameter so tests can
 * pass a plain object.
 */
export async function checkDispatchAuth(
  headers: Pick<Headers, "get">,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<DispatchAuthResult> {
  try {
    const secret = readSecret(env);
    if (secret === null) return DENIED_503;

    const presented = parseBearer(headers.get("authorization"));
    // Always hash and compare both, even with no usable header, so the work
    // done does not reveal whether the header was missing, malformed or wrong.
    const [expectedDigest, presentedDigest] = await Promise.all([
      sha256(secret),
      sha256(presented ?? ""),
    ]);
    const equal = bytesEqualConstantTime(expectedDigest, presentedDigest);
    return presented !== null && equal ? { ok: true } : DENIED_401;
  } catch {
    return DENIED_503;
  }
}
