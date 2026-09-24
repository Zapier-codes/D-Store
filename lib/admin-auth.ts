import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { notFound } from "next/navigation";

/**
 * Admin gate — leaf `3.c.iv.zi` (Admin hardening).
 *
 * `/admin/*` and `/api/admin/*` were unauthenticated by design while the
 * whole app was dummy data. They're deployed on Vercel, and the catalog
 * now holds real third-party data, so they're gated here. The route set
 * is kept, not removed: HANDOVER.md says editorial toggles and sponsored
 * slots retire once `5.g.v.zi` makes the signed index the source of
 * truth, and deleting them ahead of that is a product decision, not a
 * hardening one — gating is reversible.
 *
 * D-Store has no accounts ("No account required", docs/D-STORE.md §3),
 * so "real authentication" here is HTTP Basic auth against one shared
 * secret held in Vercel environment variables:
 *
 *   ADMIN_PASSWORD   required, at least 16 characters
 *   ADMIN_USERNAME   optional, defaults to "admin"
 *
 * Fails CLOSED: with `ADMIN_PASSWORD` unset (or shorter than 16
 * characters) every admin route answers 503 to everyone. Deploying this
 * change therefore closes the exposure immediately, before the secret
 * is even configured. Basic auth has no built-in throttling, which is
 * why the password length floor exists; a long random value is the
 * brute-force defence.
 *
 * Three layers use the same check:
 *   1. `middleware.ts` — the primary gate, so a denied request never
 *      reaches a page or handler.
 *   2. `guardAdminRequest` — first line of every `/api/admin` handler.
 *   3. `requireAdminPage` — first line of every `/admin` page.
 * Layers 2 and 3 are defence in depth: middleware-only auth has been
 * bypassed before (CVE-2025-29927, `x-middleware-subrequest`), and a
 * route added later that forgets a check should still not be open.
 *
 * Basic credentials are re-sent automatically by the browser, including
 * on cross-site requests, so the JSON mutation routes also require an
 * `Origin` header matching this host (CSRF guard) — a same-origin
 * `fetch` from the admin UI always sends one for PATCH/POST/DELETE.
 *
 * Uses only Web APIs (`crypto.subtle`, `atob`, `TextEncoder`) so it runs
 * in the Edge middleware runtime as well as Node.
 */

export const ADMIN_PASSWORD_MIN_LENGTH = 16;

export type AdminCheck =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 503; message: string };

/** SHA-256 both sides, then compare every byte — no early exit on the first mismatch, and equal-length inputs regardless of what was sent. */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const ua = new Uint8Array(da);
  const ub = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

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

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function checkAdminAuth(headers: Headers, method: string): Promise<AdminCheck> {
  const expectedPassword = process.env.ADMIN_PASSWORD ?? "";
  const expectedUser = process.env.ADMIN_USERNAME || "admin";

  if (expectedPassword.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      status: 503,
      message: `Admin is disabled: set ADMIN_PASSWORD (at least ${ADMIN_PASSWORD_MIN_LENGTH} characters) to enable it.`,
    };
  }

  const creds = parseBasic(headers.get("authorization"));
  // Always run both comparisons, even with no/garbled credentials, so timing doesn't reveal which check failed.
  const userOk = await timingSafeEqual(creds?.user ?? "", expectedUser);
  const passOk = await timingSafeEqual(creds?.password ?? "", expectedPassword);
  if (!creds || !userOk || !passOk) {
    return { ok: false, status: 401, message: "Authentication required." };
  }

  if (!SAFE_METHODS.has(method.toUpperCase())) {
    const origin = headers.get("origin");
    const host = headers.get("x-forwarded-host") ?? headers.get("host");
    let originHost: string | null = null;
    try {
      originHost = origin ? new URL(origin).host : null;
    } catch {
      originHost = null;
    }
    if (!originHost || !host || originHost !== host) {
      return { ok: false, status: 403, message: "Cross-origin admin request refused." };
    }
  }

  return { ok: true };
}

/** Response for a failed check. 401 carries the Basic challenge so browsers show their login prompt. */
export function adminDeniedResponse(check: Extract<AdminCheck, { ok: false }>): NextResponse {
  const res = new NextResponse(check.message, {
    status: check.status,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
  if (check.status === 401) {
    res.headers.set("WWW-Authenticate", 'Basic realm="D-Store admin", charset="UTF-8"');
  }
  return res;
}

/** Layer 2 — first line of every `/api/admin` handler: `const denied = await guardAdminRequest(request); if (denied) return denied;` */
export async function guardAdminRequest(request: Request): Promise<NextResponse | null> {
  const check = await checkAdminAuth(request.headers, request.method);
  return check.ok ? null : adminDeniedResponse(check);
}

/** Layer 3 — first line of every `/admin` page. A page can't return a 401 challenge, so a request that somehow got past middleware unauthenticated gets a 404, not the page. */
export async function requireAdminPage(): Promise<void> {
  const check = await checkAdminAuth(await nextHeaders(), "GET");
  if (!check.ok) notFound();
}

export function isAdminPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/")
  );
}
