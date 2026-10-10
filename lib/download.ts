/**
 * Download URL for the details page's download control (operator-directed 2026-10-10).
 *
 * A website cannot install an Android app — the click can only hand the browser a file. So the
 * details page offers exactly two honest things: **Download**, which points at the store's own
 * `/api/apps/<slug>/download` door (or a third-party app's own source URL), and **Share**, which
 * shares the page link. Everything that pretended otherwise (a simulated "Installing…" fill, a
 * device-local "installed" record that flipped the button to Open/Update/Uninstall, Android
 * `intent:` open/uninstall links, the wavy progress ring, the version advisory banner) is removed.
 *
 * First-party apps (Zealot): the store's own door, so the browser's download shows this domain and
 * supports resume; a `version=` query selects an older release. The door streams the file itself
 * (see `app/api/apps/[slug]/download/route.ts`).
 *
 * Third-party apps (Aptoide): the source's own URL, when it is a real https link; otherwise the
 * caller renders the disabled control (never a dead or unsafe link).
 */

/** An absolute `https://` URL — the only shape the control will turn into a link. */
export function isHttpsUrl(value: unknown): value is string {
  return typeof value === "string" && /^https:\/\/[a-z0-9.-]+/i.test(value);
}

/**
 * The download URL for an app, or `""` when there is nothing honest to link to (the caller then
 * renders the disabled control). First-party apps always use this store's own door; third-party
 * apps use their source URL, but only when it is a real https link.
 */
export function appDownloadUrl(app: {
  slug: string;
  apk: string;
  version_status?: string | null;
  third_party?: boolean;
}): string {
  if (!app.slug) return "";
  if (app.third_party) return isHttpsUrl(app.apk) ? app.apk : "";
  // A pulled release has no file to hand over (the source withdrew it).
  if (app.version_status === "pulled") return "";
  return `/api/apps/${encodeURIComponent(app.slug)}/download`;
}
