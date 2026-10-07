/**
 * Real-image URL guard — leaf `3.d.ii.zi` (Accessibility & Performance
 * → Image CDN + responsive `srcset`).
 *
 * Real icon/screenshot URLs only exist for third-party (Aptoide)
 * catalog entries — `lib/sources/aptoide.ts`'s `normalizeAptoideApp`
 * maps `raw.icon` and `media.screenshots[].url` straight through, both
 * real `https://pool.img.aptoide.com/...` URLs (confirmed against the
 * ingested snapshot, `storage/downloads/aptoide-snapshot.json`, which is import
 * data for the catalog table and no longer read by the storefront).
 * First-party (Zealot) dummy entries still carry dummy filename-shaped
 * strings in those same `App.icon`/`App.screenshots` fields —
 * `lib/mock-data.ts`'s own header comment: no real icon/screenshot
 * assets exist for them yet — so those must keep falling through to
 * the generated `AppIcon` tile / colored placeholder unchanged.
 *
 * The one check every render site needs before pointing `next/image`
 * at a field that might be either shape: only an `https://` URL is
 * ever a real, fetchable image. Same gate `lib/sources/aptoide.ts`'s
 * own `aptoideDownloadUrl` already uses for the APK download link, so
 * a malformed/missing value can't be handed to `next/image` (which
 * throws on a relative/invalid `src` rather than failing soft).
 */
export function isRealImageUrl(value: string | undefined | null): value is string {
  return typeof value === "string" && value.startsWith("https://");
}

/**
 * Hosts `next/image` may optimize. Must stay in step with `images.remotePatterns` in next.config.mjs
 * for the fixed Aptoide CDN; anything else (Zealot's icon and screenshot endpoints, which redirect to
 * a signed storage URL on yet another host) is rendered `unoptimized`, so the browser fetches it
 * directly and the image shows whatever host Zealot or its storage is on, with no allow-list to keep
 * in sync (an un-allow-listed host makes the optimizer answer 400 and the image goes blank).
 */
const OPTIMIZABLE_IMAGE_HOSTS = new Set(["pool.img.aptoide.com"]);

export function isOptimizableImageUrl(value: string | undefined | null): boolean {
  if (!isRealImageUrl(value)) return false;
  try {
    return OPTIMIZABLE_IMAGE_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}
