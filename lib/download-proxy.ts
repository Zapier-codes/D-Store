import type { App } from "./mock-data";
import { decideRollback } from "./rollback";

/**
 * Pure helpers for `/api/apps/[slug]/download`, the store's own download door.
 *
 * Zealot's download URL answers a redirect to a signed GitHub storage link, so a browser's download list
 * (and its notification) showed GitHub's storage host as the source. The route streams the same file from
 * this store's own domain instead, so only the store's host is shown. Nothing here touches the network.
 */

const DEFAULT_HOSTS = "zealot-deploy-latest.onrender.com";

/** Hosts the route may fetch from: the Zealot host(s), the same `ZEALOT_MEDIA_HOSTS` list `next.config.mjs` uses. */
export function allowedUpstreamHosts(env: Record<string, string | undefined> = process.env): string[] {
  return (env.ZEALOT_MEDIA_HOSTS || DEFAULT_HOSTS)
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host !== "");
}

/** True only for an `https://` URL, without credentials, on an allowed host (the route never fetches anything else). */
export function isAllowedUpstream(url: unknown, hosts: readonly string[]): url is string {
  if (typeof url !== "string" || url === "") return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      hosts.includes(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

/** `<slug>-<version>.apk` limited to `[A-Za-z0-9._-]` (the "name and version" rule), never empty. */
export function downloadFilename(slug: string, version: string): string {
  const clean = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  const base = [clean(String(slug ?? "")), clean(String(version ?? ""))].filter((part) => part !== "").join("-");
  return `${(base || "app").slice(0, 100)}.apk`;
}

/**
 * The upstream URL to stream: the current release's `apk` for no version (or the current version), else the
 * link an OLDER version in the history is offered with (`decideRollback`, so a pulled, halted or still
 * rolling-out release is refused exactly as the page refuses to link it). `null` when there is none.
 */
export function pickUpstreamUrl(
  app: Pick<App, "apk" | "version" | "version_history">,
  requestedVersion: string | null
): string | null {
  if (requestedVersion === null || requestedVersion === "" || requestedVersion === app.version) {
    return app.apk ? app.apk : null;
  }
  const entries = app.version_history ?? [];
  const index = entries.findIndex((entry) => entry.version_name === requestedVersion);
  if (index < 0) return null;
  const offer = decideRollback(entries, index);
  return offer.offered ? offer.url : null;
}

/**
 * What the download door checks about Zealot's answer BEFORE it streams anything, and the guard that keeps a
 * short or long body from ever looking like a finished file (operator-directed 2026-10-09, from Zealot's
 * Task 46a/46c finding: a cut-off download is a short APK, and a short APK reads "problem parsing the package").
 *
 * Nothing here touches the network; `lengthGuard` only transforms a stream it is given.
 */

/** True unless the upstream says its body is a web page, JSON or XML (an error body), which is never an APK. */
export function isAcceptableUpstreamType(contentType: string | null): boolean {
  if (contentType === null) return true;
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type === "") return true;
  if (type.startsWith("text/")) return false;
  if (type === "application/json" || type === "application/xml" || type === "application/xhtml+xml") return false;
  if (type.endsWith("+json") || type.endsWith("+xml")) return false;
  return true;
}

/** `content-length` as a whole number of bytes; `null` when it is absent or not plain digits. */
export function declaredBodyBytes(contentLength: string | null): number | null {
  if (contentLength === null) return null;
  const text = contentLength.trim();
  if (!/^\d{1,15}$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

/** Bytes a `206` body must carry, from `content-range: bytes a-b/total`; `null` when it is unreadable or impossible. */
export function rangeSpanBytes(contentRange: string | null): number | null {
  if (contentRange === null) return null;
  const match = /^bytes (\d{1,15})-(\d{1,15})\/(\d{1,15}|\*)$/i.exec(contentRange.trim());
  if (match === null) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end < start) return null;
  if (match[3] !== "*" && end >= Number(match[3])) return null;
  return end - start + 1;
}

export type UpstreamCheck = { ok: true; expectedBytes: number | null } | { ok: false; reason: string };

/**
 * Decide whether Zealot's answer may be streamed. `expectedBytes` is the exact body length to enforce, or
 * `null` when the answer has no `content-length` (chunked): then the HTTP layer already reports an early
 * end, so there is nothing more to count against.
 */
export function checkUpstream(status: number, headers: { get(name: string): string | null }): UpstreamCheck {
  if (status !== 200 && status !== 206) return { ok: false, reason: `the file host answered ${status}` };
  if (!isAcceptableUpstreamType(headers.get("content-type"))) {
    return { ok: false, reason: "the file host sent a page or data instead of a file" };
  }
  const encoding = (headers.get("content-encoding") ?? "").trim().toLowerCase();
  if (encoding !== "" && encoding !== "identity") {
    return { ok: false, reason: "the file host compressed the file, so its length cannot be checked" };
  }
  const rawLength = headers.get("content-length");
  const declared = declaredBodyBytes(rawLength);
  if (rawLength !== null && declared === null) {
    return { ok: false, reason: "the file host sent an unreadable content-length" };
  }
  if (status === 206) {
    const span = rangeSpanBytes(headers.get("content-range"));
    if (span === null) return { ok: false, reason: "the file host sent a partial answer with no readable content-range" };
    if (declared !== null && declared !== span) {
      return { ok: false, reason: "the file host's content-length and content-range disagree" };
    }
    return { ok: true, expectedBytes: span };
  }
  if (declared === 0) return { ok: false, reason: "the file host sent an empty file" };
  return { ok: true, expectedBytes: declared };
}

/**
 * A pass-through stream that ERRORS (aborting the response) when the body is longer than `expected` or ends
 * before `expected` bytes have passed, so the browser shows a failed download instead of keeping a short file.
 */
export function lengthGuard(expected: number): TransformStream<Uint8Array, Uint8Array> {
  let seen = 0;
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > expected) {
        controller.error(new Error(`the download is longer than announced (${expected} bytes)`));
        return;
      }
      controller.enqueue(chunk);
    },
    flush(controller) {
      if (seen !== expected) controller.error(new Error(`the download ended after ${seen} of ${expected} bytes`));
    },
  });
}
