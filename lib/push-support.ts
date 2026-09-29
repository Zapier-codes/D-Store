import { MAX_SLUGS, decodeBase64Url, validateSlugs, type Validation } from "@/lib/push-validate";

/**
 * Browser-side Web Push helpers — leaf `5.k.viii.zi`, first of the two
 * `5.k.viii` leaves (split out of `5.k.ii.zi`). Pure functions: no I/O, no
 * DOM writes, no React, no new dependency, and nothing here runs at import
 * time. `lib/push-client.ts` (`5.k.viii.zo`) and the UI leaves build on it.
 *
 * Every function takes what it needs as an argument (or defaults to a
 * global only when *called*), so plain Node can test it with fakes.
 * None of them throws.
 */

/** An uncompressed P-256 point: `0x04` then 32 bytes of X and 32 of Y. */
export const VAPID_PUBLIC_KEY_BYTES = 65;
/** The same key as unpadded base64url. Matches `P256DH_ENCODED_LENGTH` — same curve, same encoding. */
const VAPID_ENCODED_LENGTH = 87;

/**
 * Decodes a VAPID public key (what `npx web-push generate-vapid-keys` prints
 * as "Public Key") into the bytes `pushManager.subscribe` wants as
 * `applicationServerKey`. Strict: unpadded base64url, canonical, exactly 65
 * bytes, first byte `0x04`. Uses the same decoder the server validates
 * subscription keys with, so the two can never disagree about what
 * "base64url" means.
 */
export function decodeVapidPublicKey(input: unknown): Validation<Uint8Array> {
  try {
    if (typeof input !== "string") return { ok: false, error: "VAPID key must be a string" };
    if (input.length !== VAPID_ENCODED_LENGTH) return { ok: false, error: "VAPID key has the wrong length" };
    const bytes = decodeBase64Url(input);
    if (!bytes || bytes.length !== VAPID_PUBLIC_KEY_BYTES) {
      return { ok: false, error: "VAPID key is not valid unpadded base64url" };
    }
    if (bytes[0] !== 0x04) return { ok: false, error: "VAPID key is not an uncompressed P-256 point" };
    return { ok: true, value: bytes };
  } catch {
    return { ok: false, error: "VAPID key is invalid" };
  }
}

/**
 * The site's VAPID public key, or `null` when it is unset **or malformed**.
 * A bad key behaves exactly like no key: the caller shows no control and
 * never attempts a subscribe that could only fail.
 *
 * `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` is written out literally
 * (here, as the default of `raw`) on purpose. Next inlines `NEXT_PUBLIC_*`
 * into the browser bundle only for a literal member access; a computed
 * `process.env[name]` would read `undefined` in the browser and the
 * feature would silently never appear. The parameter exists so a test can
 * pass a value in.
 */
export function getVapidPublicKey(raw: unknown = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY): Uint8Array | null {
  try {
    if (typeof raw !== "string") return null;
    const decoded = decodeVapidPublicKey(raw.trim());
    return decoded.ok ? decoded.value : null;
  } catch {
    return null;
  }
}

export type PushSupport = "unsupported" | "needs_home_screen" | "supported";

/**
 * The slice of the browser `getPushSupport` looks at, injected so Node can
 * test it. In a page: `{ navigator, window, matchMedia: window.matchMedia }`
 * (see `browserPushSupportEnv`).
 */
export interface PushSupportEnv {
  navigator?: unknown;
  window?: unknown;
  matchMedia?: ((query: string) => { matches: boolean }) | null;
}

/** The env for the current page. Reads globals when called, never at import; empty outside a browser. */
export function browserPushSupportEnv(): PushSupportEnv {
  try {
    if (typeof window === "undefined") return {};
    return {
      navigator: typeof navigator === "undefined" ? undefined : navigator,
      window,
      matchMedia: typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : null,
    };
  } catch {
    return {};
  }
}

const IOS_UA = /iPhone|iPad|iPod/;

function has(target: unknown, key: string): boolean {
  return (typeof target === "object" || typeof target === "function") && target !== null && key in target;
}

function isIosFamily(nav: Record<string, unknown>): boolean {
  if (typeof nav.userAgent === "string" && IOS_UA.test(nav.userAgent)) return true;
  // iPadOS 13+ reports a desktop Mac user agent; the touch points give it away.
  return nav.platform === "MacIntel" && typeof nav.maxTouchPoints === "number" && nav.maxTouchPoints > 1;
}

function isStandalone(nav: Record<string, unknown>, matchMedia: PushSupportEnv["matchMedia"]): boolean {
  if (nav.standalone === true) return true;
  try {
    return typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches === true;
  } catch {
    return false;
  }
}

/**
 * Can this browser do Web Push, and if not, is there something the visitor
 * can do about it?
 *
 * - `supported` — service workers, `PushManager` and `Notification` all exist.
 * - `needs_home_screen` — an iOS-family device that is not running as an
 *   installed web app. iOS delivers Web Push only to sites added to the Home
 *   Screen, and outside it `PushManager` does not exist at all, so this is
 *   checked **before** the API check: otherwise the visitor would see a dead
 *   "unsupported" instead of the one step that fixes it.
 * - `unsupported` — anything else, including old iOS even when installed.
 */
export function getPushSupport(env: PushSupportEnv): PushSupport {
  try {
    const nav = env?.navigator;
    const win = env?.window;
    if (typeof nav !== "object" || nav === null) return "unsupported";
    const navRecord = nav as Record<string, unknown>;

    if (isIosFamily(navRecord) && !isStandalone(navRecord, env.matchMedia)) return "needs_home_screen";

    if (has(nav, "serviceWorker") && has(win, "PushManager") && has(win, "Notification")) return "supported";
    return "unsupported";
  } catch {
    return "unsupported";
  }
}

/** A saved app as `lib/favorites.ts` stores it; only these two fields are read. */
export interface SlugSource {
  slug: string;
  addedAt: string;
}

export interface SelectedSlugs {
  slugs: string[];
  /** More usable favorites existed than the server accepts; the oldest were left out. */
  truncated: boolean;
  /** Entries left out because the slug is not in the catalog format `POST /api/push/subscribe` accepts. */
  skipped: number;
}

/**
 * Turns saved apps into the slug list to send with a subscription.
 *
 * `validateSlugs` refuses a list over `MAX_SLUGS` instead of truncating
 * (`5.k.v.zi`) and refuses the whole list if one entry is malformed, so a
 * client that sent favorites as-is would get a `400` for a heavy user or one
 * odd slug. This caps and filters first. **Newest first, oldest dropped** —
 * the apps a visitor saved most recently are the ones they care about — and
 * `truncated`/`skipped` say so, so the UI never implies "all your apps".
 *
 * The result always passes `validateSlugs`. The cap can be lowered with
 * `max`, never raised past the server's.
 */
export function selectSlugs(favorites: unknown, max: number = MAX_SLUGS): SelectedSlugs {
  const cap = Number.isInteger(max) && max >= 0 ? Math.min(max, MAX_SLUGS) : MAX_SLUGS;
  const empty: SelectedSlugs = { slugs: [], truncated: false, skipped: 0 };
  try {
    if (!Array.isArray(favorites)) return empty;
    // Bound the work before touching any element, same rule as validateSlugs.
    const entries = favorites.slice(0, 10_000) as unknown[];

    const candidates: { slug: string; addedAt: string }[] = [];
    let skipped = 0;
    for (const entry of entries) {
      const slug = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>).slug : undefined;
      const addedAt = (entry as Record<string, unknown> | null)?.addedAt;
      // Reuse the server's own slug rules rather than copying the pattern.
      if (typeof slug !== "string" || !validateSlugs([slug]).ok) {
        skipped++;
        continue;
      }
      candidates.push({ slug, addedAt: typeof addedAt === "string" ? addedAt : "" });
    }

    // Newest first; `sort` is stable, so equal timestamps keep their input order.
    candidates.sort((a, b) => b.addedAt.localeCompare(a.addedAt));

    const seen = new Set<string>();
    const unique: string[] = [];
    for (const c of candidates) {
      if (!seen.has(c.slug)) {
        seen.add(c.slug);
        unique.push(c.slug);
      }
    }
    // Entries past the 10,000 read bound were never looked at, so they count as truncated too.
    return { slugs: unique.slice(0, cap), truncated: unique.length > cap || favorites.length > entries.length, skipped };
  } catch {
    return empty;
  }
}
