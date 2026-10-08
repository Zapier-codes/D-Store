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
