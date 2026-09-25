/**
 * Real-image URL guard — leaf `3.d.ii.zi` (Accessibility & Performance
 * → Image CDN + responsive `srcset`).
 *
 * Real icon/screenshot URLs only exist for third-party (Aptoide)
 * catalog entries — `lib/sources/aptoide.ts`'s `normalizeAptoideApp`
 * maps `raw.icon` and `media.screenshots[].url` straight through, both
 * real `https://pool.img.aptoide.com/...` URLs (confirmed against the
 * ingested snapshot, `storage/downloads/aptoide-snapshot.json`).
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
