/**
 * Request/response helpers shared by the two Web Push routes —
 * leaf `5.k.vi.zi`. Standard `Request`/`Response` only (no `next/server`), so
 * it runs the same in a route handler and in a plain Node test.
 *
 * The routes are anonymous and unauthenticated by design (D-Store has no
 * accounts), so everything here exists to keep a hostile caller cheap to
 * refuse: a JSON-only content type (which also stops a cross-site form
 * `POST` — a browser will not send `application/json` cross-origin without a
 * CORS preflight, and these routes grant none), a hard body-size cap enforced
 * while reading rather than after, and error bodies that are fixed strings.
 */

/** Room for 200 slugs of 100 characters, a 2048-character endpoint and both keys, with headroom. */
export const SUBSCRIBE_MAX_BODY_BYTES = 32 * 1024;
/** Just an endpoint. */
export const UNSUBSCRIBE_MAX_BODY_BYTES = 4 * 1024;

export type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 | 415; error: string };

/**
 * Read a JSON body of at most `maxBytes`. The cap is enforced on the stream —
 * a declared `Content-Length` over the cap is refused before reading, and a
 * body with no or a lying length is cut off as soon as it exceeds the cap —
 * so an oversized request never sits fully in memory.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<BodyResult> {
  const mediaType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return { ok: false, status: 415, error: "Content-Type must be application/json" };
  }

  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    return { ok: false, status: 413, error: "Request body too large" };
  }

  if (!request.body) return { ok: false, status: 400, error: "Invalid JSON body" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413, error: "Request body too large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }

  try {
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
}

const NO_STORE = { "Cache-Control": "no-store" };

/** Success: no body, so nothing about the stored subscription can be echoed. */
export function noContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE });
}

/** Failure: a fixed message only — never request data. */
export function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: NO_STORE });
}
