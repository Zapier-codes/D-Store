/**
 * Authentication for the read-only stats route — leaf `5.g.v.zo`.
 *
 * `GET /api/stats` is read by Zealot's admin (Zealot Task 31b), not by
 * visitors, so it is gated by one bearer token held in an environment
 * variable of its OWN:
 *
 *   STATS_READ_TOKEN   required, at least 32 characters, no whitespace
 *
 * It is deliberately not `PUSH_DISPATCH_SECRET` and not `ADMIN_PASSWORD`: the
 * three can be rotated and leaked independently, and a stats token that leaks
 * can only read aggregates.
 *
 * Same shape and rules as `lib/push-dispatch-auth.ts` (read its header for the
 * reasoning): `Authorization: Bearer <token>`; with the token unset, too
 * short or containing whitespace every request is `503` and nothing is
 * compared (fails closed); otherwise both sides are SHA-256 hashed and the
 * digests compared with no early exit; a missing, malformed or wrong header is
 * `401`, and the three are indistinguishable. Nothing here logs, and the token
 * never appears in a result. Never throws; nothing runs at import; Web APIs
 * only.
 *
 * This route lives at `/api/stats`, NOT under `/api/admin/`: that prefix is
 * behind the shared-password Basic gate in `middleware.ts`, which would refuse
 * Zealot's bearer token before this check ever ran.
 */

import { bytesEqualConstantTime } from "./push-dispatch-auth";

export const STATS_READ_TOKEN_MIN_LENGTH = 32;

export type StatsAuthResult = { ok: true } | { ok: false; status: 401 | 503 };

const DENIED_401: StatsAuthResult = { ok: false, status: 401 };
const DENIED_503: StatsAuthResult = { ok: false, status: 503 };

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function parseBearer(header: string | null): string | null {
  if (typeof header !== "string") return null;
  const match = /^bearer ([^\s]+)$/i.exec(header);
  return match ? match[1] : null;
}

function readToken(env: Readonly<Record<string, string | undefined>>): string | null {
  const token = env.STATS_READ_TOKEN;
  if (typeof token !== "string") return null;
  if (token.length < STATS_READ_TOKEN_MIN_LENGTH) return null;
  if (/\s/.test(token)) return null;
  return token;
}

export async function checkStatsAuth(
  headers: Pick<Headers, "get">,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<StatsAuthResult> {
  try {
    const token = readToken(env);
    if (token === null) return DENIED_503;

    const presented = parseBearer(headers.get("authorization"));
    const [expected, got] = await Promise.all([sha256(token), sha256(presented ?? "")]);
    const equal = bytesEqualConstantTime(expected, got);
    return presented !== null && equal ? { ok: true } : DENIED_401;
  } catch {
    return DENIED_503;
  }
}
