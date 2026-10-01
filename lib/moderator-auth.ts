/**
 * Moderator token check — leaf `3.c.vi.zi`.
 *
 * Pure and Edge-safe: Web APIs only (`crypto.subtle`, `atob`, `TextEncoder`,
 * `Headers`), no `node:` import, no `next/*` import, nothing runs at import.
 * The wiring (middleware branch, handler and page guards) is `3.c.vi.zo`;
 * this file only answers "is this request from a configured moderator?".
 *
 * Design (recorded in `3.c.iii.zi` part 2's split note, in HANDOVER.md):
 *
 *   - One server-only env var, `MODERATOR_TOKENS`: a JSON array of
 *     `{ "id": "...", "sha256": "..." }`. `sha256` is the lowercase hex
 *     SHA-256 of the moderator's token, so the secret itself is never in
 *     Vercel's env. Extra keys on an entry (a `"note"`, say) are ignored.
 *   - A moderator signs in with HTTP Basic auth: the id is the username,
 *     the generated token is the password. D-Store has no accounts.
 *   - `id` matches `^[a-z0-9][a-z0-9._-]{1,31}$`, at most 20 entries.
 *     A token is at least 32 characters with no whitespace, generated
 *     (`openssl rand -base64 24` gives exactly 32), which is why a fast
 *     hash is the right one. IF A HUMAN IS EVER ALLOWED TO CHOOSE THEIR OWN
 *     PASSWORD, THIS MUST MOVE TO A SLOW HASH.
 *   - Fails CLOSED: unset, blank, `[]`, unparseable, over-20, a malformed
 *     entry, a duplicate id or a duplicate digest makes the WHOLE config
 *     unusable and every request answers 503. One bad entry never leaves
 *     the other moderators in place and never opens anything.
 *   - An unknown id and a wrong token are indistinguishable: same status
 *     (401), same message, same work (the stored digest is replaced by a
 *     dummy and the compare still runs).
 *   - The shared `ADMIN_PASSWORD` is never consulted and cannot pass.
 *   - Mutating methods also need an `Origin` matching this host (CSRF
 *     guard: browsers re-send Basic credentials cross-site). Checked only
 *     after the credentials are good, as in `lib/admin-auth.ts`.
 *   - Never logs, and never returns, a token or a digest. The one thing a
 *     good check returns is the moderator's id, so a later leaf can record
 *     who decided.
 */

export const MODERATOR_TOKENS_ENV = "MODERATOR_TOKENS";
export const MODERATOR_MAX_ENTRIES = 20;
export const MODERATOR_TOKEN_MIN_LENGTH = 32;
/** A longer token is refused as malformed; it is not hashed in full. */
export const MODERATOR_TOKEN_MAX_LENGTH = 256;
/** A longer env value is invalid; 20 entries are about 2.5 KB. */
const CONFIG_MAX_CHARS = 8192;

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type ModeratorEntry = { id: string; sha256: string };

export type ModeratorConfig =
  | { status: "ok"; moderators: ModeratorEntry[] }
  | { status: "unconfigured" }
  | { status: "invalid"; reason: string };

export type ModeratorCheck =
  | { ok: true; moderator: string }
  | { ok: false; status: 401 | 403 | 503; message: string };

type Env = Record<string, string | undefined>;

function invalid(reason: string): ModeratorConfig {
  return { status: "invalid", reason };
}

/**
 * Parse `MODERATOR_TOKENS`. Never throws. `reason` names the problem and an
 * entry's position, never a value, so it is safe to log.
 */
export function readModeratorConfig(env: Env = process.env): ModeratorConfig {
  const raw = env?.[MODERATOR_TOKENS_ENV];
  if (typeof raw !== "string" || raw.trim() === "") return { status: "unconfigured" };
  if (raw.length > CONFIG_MAX_CHARS) return invalid("the value is too long");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalid("the value is not valid JSON");
  }
  if (!Array.isArray(parsed)) return invalid("the value is not a JSON array");
  if (parsed.length === 0) return { status: "unconfigured" };
  if (parsed.length > MODERATOR_MAX_ENTRIES) {
    return invalid(`more than ${MODERATOR_MAX_ENTRIES} entries`);
  }

  const seenIds = new Set<string>();
  const seenDigests = new Set<string>();
  const moderators: ModeratorEntry[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const entry: unknown = parsed[i];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return invalid(`entry ${i} is not an object`);
    }
    const { id, sha256 } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !ID_PATTERN.test(id)) {
      return invalid(`entry ${i} has a missing or malformed id`);
    }
    if (typeof sha256 !== "string" || !DIGEST_PATTERN.test(sha256)) {
      return invalid(`entry ${i} has a missing or malformed sha256 (64 lowercase hex characters)`);
    }
    if (seenIds.has(id)) return invalid(`entry ${i} repeats an id`);
    // Two moderators on one token would make "who decided" unanswerable.
    if (seenDigests.has(sha256)) return invalid(`entry ${i} repeats a sha256`);
    seenIds.add(id);
    seenDigests.add(sha256);
    moderators.push({ id, sha256 });
  }
  return { status: "ok", moderators };
}

const encoder = new TextEncoder();

async function sha256Bytes(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

/** Lowercase hex SHA-256 of a token: the value that goes in `MODERATOR_TOKENS`. */
export async function moderatorTokenDigest(token: string): Promise<string> {
  const bytes = await sha256Bytes(token);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Byte-wise compare of two equal-length arrays with no early exit. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Stands in for a stored digest when the id is unknown, so the compare still runs. */
const DUMMY_DIGEST = new Uint8Array(32);

function parseBasic(header: string | null): { user: string; password: string } | null {
  if (!header || !header.toLowerCase().startsWith("basic ")) return null;
  try {
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(header.slice(6).trim()), (c) => c.charCodeAt(0)),
    );
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    return { user: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

function tokenShapeOk(token: string): boolean {
  return (
    token.length >= MODERATOR_TOKEN_MIN_LENGTH &&
    token.length <= MODERATOR_TOKEN_MAX_LENGTH &&
    !/\s/.test(token)
  );
}

function unauthenticated(): ModeratorCheck {
  return { ok: false, status: 401, message: "Authentication required." };
}

/**
 * Check a request. Order: config (503) -> credentials (401) -> Origin on
 * mutating methods (403). Never throws; any surprise is a refusal.
 */
export async function checkModeratorAuth(
  headers: Headers,
  method: string,
  env: Env = process.env,
): Promise<ModeratorCheck> {
  try {
    const config = readModeratorConfig(env);
    if (config.status !== "ok") {
      return {
        ok: false,
        status: 503,
        message: `Moderation is disabled: set ${MODERATOR_TOKENS_ENV} to enable it.`,
      };
    }

    const creds = parseBasic(headers.get("authorization"));
    const user = creds?.user ?? "";
    const token = creds?.password ?? "";
    const shapeOk = tokenShapeOk(token);

    // Same work for every failure: look up, then always hash and compare.
    const found = config.moderators.find((m) => m.id === user);
    const expected = found ? hexToBytes(found.sha256) : DUMMY_DIGEST;
    const presented = await sha256Bytes(token.slice(0, MODERATOR_TOKEN_MAX_LENGTH + 1));
    const digestOk = bytesEqual(presented, expected);

    if (!creds || !found || !shapeOk || !digestOk) return unauthenticated();

    if (!SAFE_METHODS.has(String(method).toUpperCase())) {
      const origin = headers.get("origin");
      const host = headers.get("x-forwarded-host") ?? headers.get("host");
      let originHost: string | null = null;
      try {
        originHost = origin ? new URL(origin).host : null;
      } catch {
        originHost = null;
      }
      if (!originHost || !host || originHost !== host) {
        return { ok: false, status: 403, message: "Cross-origin moderation request refused." };
      }
    }

    return { ok: true, moderator: found.id };
  } catch {
    return unauthenticated();
  }
}
