import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { notFound } from "next/navigation";
import { checkModeratorAuth, readModeratorConfig, type ModeratorCheck } from "@/lib/moderator-auth";

/**
 * The `/moderation` gate — leaf `3.c.vi.zo`. Wires `lib/moderator-auth.ts`
 * (the pure check, `3.c.vi.zi`) into the three layers the admin gate uses
 * (`lib/admin-auth.ts`):
 *
 *   1. `middleware.ts` — the primary gate, ahead of the region lookup.
 *   2. `requireModeratorRequest` — first line of every `/api/moderation`
 *      handler.
 *   3. `requireModeratorPage` — first line of every `/moderation` page.
 *
 * Layers 2 and 3 are defence in depth: middleware-only auth has been
 * bypassed before (CVE-2025-29927, `x-middleware-subrequest`), a path the
 * middleware does not recognise but the router does would skip layer 1, and
 * a route added later that forgets a check must still not be open.
 *
 * This prefix is deliberately OUTSIDE `isAdminPath`: the shared
 * `ADMIN_PASSWORD` never opens `/moderation`, and a moderator token never
 * opens `/admin`. They are separate secrets with separate realms.
 */

const REALM = 'Basic realm="D-Store moderation", charset="UTF-8"';

export function isModerationPath(pathname: string): boolean {
  return (
    pathname === "/moderation" ||
    pathname.startsWith("/moderation/") ||
    pathname === "/api/moderation" ||
    pathname.startsWith("/api/moderation/")
  );
}

let lastLoggedReason: string | null = null;

/**
 * On `503`, say why in the server log, once per distinct reason, so an
 * operator can tell "unset" from "a typo in the JSON". The reason holds no
 * value (no id, digest or token): see `readModeratorConfig`.
 */
function logWhyDisabled(): void {
  const config = readModeratorConfig();
  const reason = config.status === "invalid" ? `invalid: ${config.reason}` : "unset or empty";
  if (reason === lastLoggedReason) return;
  lastLoggedReason = reason;
  console.error(`[moderation] disabled — MODERATOR_TOKENS is ${reason}`);
}

/** Response for a failed check. `401` carries the Basic challenge so browsers show their login prompt. */
export function moderatorDeniedResponse(check: Extract<ModeratorCheck, { ok: false }>): NextResponse {
  if (check.status === 503) logWhyDisabled();
  const res = new NextResponse(check.message, {
    status: check.status,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
  if (check.status === 401) res.headers.set("WWW-Authenticate", REALM);
  return res;
}

/** Headers every allowed `/moderation` response carries (middleware sets them; a page or handler may too). */
export function applyModerationHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

/**
 * Layer 2 — first line of every `/api/moderation` handler:
 *
 *   const gate = await requireModeratorRequest(request);
 *   if (!gate.ok) return gate.response;
 *   // gate.moderator is the moderator's id
 */
export async function requireModeratorRequest(
  request: Request,
): Promise<{ ok: true; moderator: string } | { ok: false; response: NextResponse }> {
  const check = await checkModeratorAuth(request.headers, request.method);
  return check.ok ? { ok: true, moderator: check.moderator } : { ok: false, response: moderatorDeniedResponse(check) };
}

/**
 * Layer 3 — first line of every `/moderation` page. A page cannot return a
 * `401` challenge, so a request that somehow got past middleware
 * unauthenticated gets a 404, not the page. Returns the moderator's id.
 */
export async function requireModeratorPage(): Promise<string> {
  const check = await checkModeratorAuth(await nextHeaders(), "GET");
  if (!check.ok) notFound();
  return check.moderator;
}
