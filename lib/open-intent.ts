/**
 * Deep link for the detail page's "Open" button (Android only).
 *
 * A web page cannot ask Android whether an app is installed, so "Open" is an Android `intent:` link that
 * names the app's package. Chrome on Android launches the app when it is installed AND has an activity that
 * accepts links (declares the BROWSABLE category); otherwise Chrome navigates to `S.browser_fallback_url`,
 * which is how an uninstalled app (or one that cannot be opened by a link) comes back to the detail page,
 * where the button returns to Download and the download starts again (`REINSTALL_PARAM`).
 *
 * Pure. The package name is validated (it ends up inside a URL we build), and the fallback must be a plain
 * https URL. The package name is never printed in the UI, only used in the link.
 */

export const REINSTALL_PARAM = "reinstall";

const PACKAGE_NAME = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

/** True for a well-formed Android application id such as `com.example.app`. */
export function isValidPackageName(value: unknown): value is string {
  return typeof value === "string" && value.length <= 255 && PACKAGE_NAME.test(value);
}

/** The page the intent falls back to: this app's detail page with the reinstall flag. `null` for a bad input. */
export function reinstallFallbackUrl(origin: string, appSlug: string): string | null {
  if (typeof appSlug !== "string" || appSlug === "" || !/^[A-Za-z0-9._-]+$/.test(appSlug)) return null;
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return null;
  }
  if (base.protocol !== "https:") return null;
  return `${base.origin}/app/${appSlug}?${REINSTALL_PARAM}=1`;
}

/**
 * `intent:#Intent;package=<pkg>;S.browser_fallback_url=<encoded>;end`, or `null` when the package name or the
 * fallback is not usable (the caller then keeps a plain button that does nothing, never a broken link).
 */
export function buildOpenIntentUrl(packageName: unknown, fallbackUrl: string | null): string | null {
  if (!isValidPackageName(packageName) || fallbackUrl === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(fallbackUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  return `intent:#Intent;package=${packageName};S.browser_fallback_url=${encodeURIComponent(parsed.href)};end`;
}

/** True when the page was opened by the intent's fallback (`?reinstall=1`). */
export function isReinstallRequest(search: string): boolean {
  return new URLSearchParams(search).get(REINSTALL_PARAM) === "1";
}

/** Android phones and tablets only: an `intent:` link does nothing on desktop browsers or iOS. */
export function isAndroidUserAgent(userAgent: string): boolean {
  return /\bAndroid\b/i.test(userAgent);
}

/**
 * Deep link for the "Uninstall" button (Android only). A web page cannot remove an app, and Chrome will not
 * pass a `package:` uninstall intent to Android's installer (that activity is not BROWSABLE), so the link
 * goes to the store's own app: Storeapp's `LinkActivity` answers `vyxelapps://uninstall/<package>` and opens
 * Android's uninstall confirmation, which the person must still accept. No `package=` is named, because
 * tenant builds of the store app have other application ids. When no app handles the scheme (the store app is
 * not installed) Chrome goes to the fallback, this app's page with `?uninstall=unavailable`.
 */
export const STORE_APP_SCHEME = "vyxelapps";
export const UNINSTALL_PARAM = "uninstall";
export const UNINSTALL_UNAVAILABLE = "unavailable";

/** This app's detail page with the flag that says the uninstall link found no store app. `null` for a bad input. */
export function uninstallFallbackUrl(origin: string, appSlug: string): string | null {
  const page = reinstallFallbackUrl(origin, appSlug);
  if (page === null) return null;
  return `${page.split("?")[0]}?${UNINSTALL_PARAM}=${UNINSTALL_UNAVAILABLE}`;
}

/** `intent://uninstall/<pkg>#Intent;scheme=vyxelapps;S.browser_fallback_url=<encoded>;end`, or `null` when unusable. */
export function buildUninstallIntentUrl(packageName: unknown, fallbackUrl: string | null): string | null {
  if (!isValidPackageName(packageName) || fallbackUrl === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(fallbackUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  return `intent://uninstall/${packageName}#Intent;scheme=${STORE_APP_SCHEME};S.browser_fallback_url=${encodeURIComponent(parsed.href)};end`;
}

/** True when the page was opened by the uninstall link's fallback (`?uninstall=unavailable`). */
export function isUninstallUnavailable(search: string): boolean {
  return new URLSearchParams(search).get(UNINSTALL_PARAM) === UNINSTALL_UNAVAILABLE;
}
