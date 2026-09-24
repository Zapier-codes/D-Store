import type { App } from "./mock-data";

/**
 * Trust labelling for third-party catalog entries — leaf `5.h.iii.zi`
 * (HANDOVER.md, "Resolved — catalog sources").
 *
 * The rule: only `origin: "zealot"` apps carry Zealot-derived claims (a
 * Verified developer mark, the org signing fingerprint / checksum in
 * "Verify this APK"). Everything else is third-party, labelled as such,
 * and downloaded from its source's own delivery. Every call site that
 * would render one of those claims goes through `isThirdParty` so a
 * future third source inherits the suppression instead of having to
 * remember it.
 */
export function isThirdParty(app: Pick<App, "origin">): boolean {
  return app.origin !== "zealot";
}

/** Exact wording from HANDOVER.md: "Third-party (via Aptoide)". */
export function thirdPartyLabel(app: Pick<App, "origin">): string | null {
  if (app.origin === "aptoide") return "Third-party (via Aptoide)";
  return null;
}

/** Display name of the source that delivers the file, for button/notice copy. */
export function sourceName(app: Pick<App, "origin">): string {
  return app.origin === "aptoide" ? "Aptoide" : "Zealot";
}
