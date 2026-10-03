/**
 * Aptoide catalog source adapter — leaf `5.h.ii.zi`.
 *
 * Two responsibilities, kept separate:
 *   1. `fetchAptoideApp`/`fetchAptoideSearch` — thin wrappers around
 *      Aptoide's public webservice (`https://ws75.aptoide.com/api/7`).
 *      These are what `scripts/ingest-aptoide.ts` calls to build a
 *      snapshot; nothing in the app itself calls them at request time
 *      (Section 3's caching rule: snapshot, never per-request).
 *   2. `normalizeAptoideApp` — maps one raw Aptoide app object to this
 *      repo's `App` shape. This is the part actually exercised by
 *      `getApps`/`getAppBySlug` via the snapshot loader below.
 *
 * The raw shape here (`AptoideRawApp`) is not guessed — it's the real
 * schema returned by `GET /app/get/package_name=<pkg>/aab=1` and
 * `GET /app/getMeta/package_name=<pkg>`, confirmed against a live probe
 * of `com.whatsapp` (`aptoide-probe.txt`, provided with this session).
 * Only the fields this adapter actually reads are typed; Aptoide's
 * response carries more (flags, used_features, videos, etc.) that
 * nothing here needs yet.
 *
 * Open ❓ this adapter does not resolve (HANDOVER.md, "Open ❓" under
 * "Resolved — catalog sources"): whether to keep calling this raw REST
 * API directly (what this file and the probe do) or switch to an
 * official Aptoide MCP server once one is evaluated, and Aptoide's
 * terms for re-presenting its catalog and linking to its downloads —
 * neither has been checked. Flagging again here since this file is the
 * thing that would need to change if the answer is "MCP, not raw API."
 */

import type { App, AppOrigin, ContentRating, DataSafetyInfo, NotProvidedField, ThirdPartyRating, ThirdPartyStats } from "../mock-data";
import { CATEGORY_RAW_MAX, toPlay, UNCATEGORIZED, type AppType } from "../taxonomy";
import { categoryFromKeywords } from "../taxonomy-keywords";
import { ALL_REGIONS } from "../mock-data";
import { readVersionHistory } from "../version-history";

const APTOIDE_ORIGIN: AppOrigin = "aptoide";
const API_BASE = "https://ws75.aptoide.com/api/7";

// --- Raw Aptoide response shape (only the fields this adapter reads) ---

interface AptoideSignature {
  sha1?: string;
  owner?: string;
}

interface AptoideFile {
  vername: string;
  vercode: number;
  md5sum: string;
  filesize: number;
  /** Aptoide's own APK delivery URL (`pool.apk.aptoide.com/...`). `path_alt` is the same in every ingested response. */
  path?: string;
  path_alt?: string;
  /** Full Android permission names, e.g. "android.permission.INTERNET". Present in all 12 ingested responses. */
  used_permissions?: string[];
  signature?: AptoideSignature;
  hardware?: { sdk?: number };
  /**
   * Aptoide's own malware scan result — the real path is `file.malware`
   * (`5.h.iv.zo`; the old top-level `malware` on `AptoideRawApp` never
   * existed in a real response). Present in all 12 ingested responses.
   */
  malware?: { rank?: string };
}

interface AptoideAge {
  title?: string; // e.g. "Everyone"
  pegi?: string; // e.g. "PEGI-3"
  rating?: number;
}

interface AptoideAppcoins {
  advertising?: boolean;
  billing?: boolean;
}

export interface AptoideRawApp {
  id: number;
  name: string;
  package: string;
  uname: string;
  icon: string;
  graphic?: string | null;
  // `name` is null for some real entries (7 of the first 1,506 crawled), so it is typed as it actually arrives.
  developer: { id: number; name: string | null; website?: string | null };
  file: AptoideFile;
  media: {
    description?: string;
    summary?: string;
    news?: string; // changelog-shaped free text
    screenshots?: { url: string }[];
    /**
     * `5.l.viii.zo` — a list of lower-case words that includes Play-style category words. Typed `unknown`
     * because it is untrusted input: it is read only through `categoryFromKeywords`, which never throws.
     */
    keywords?: unknown;
  };
  age?: AptoideAge;
  appcoins?: AptoideAppcoins;
  /**
   * `5.h.vii.zi` — read through `readAptoideStats` only. Also present in a real
   * response and deliberately NOT read: `stats.prating` and `stats.pdownloads`
   * (unexplained; `pdownloads` equals `downloads` in all 12 ingested apps).
   */
  stats?: unknown;
  urls?: { w?: string };
  added: string;
  modified: string;
  /**
   * `5.h.v.zo` — Aptoide's `listAppVersions` response, attached by
   * `scripts/fetch-aptoide-versions.ts`. Untyped because it is read
   * purely through `readVersionHistory`'s safe reader.
   */
  versions?: unknown;
}

// --- Trust gate (5.h.iv.zo) ---------------------------------------------

/** The only rank Aptoide reports that this store lists. Exact match: no case folding or trimming. */
export const APTOIDE_TRUSTED_RANK = "TRUSTED";

/** Aptoide's scan rank for a response, or `null` when the response carries none (a missing, non-object or non-string value). Never throws. */
export function aptoideScanRank(raw: { file?: { malware?: { rank?: unknown } | null } | null } | null | undefined): string | null {
  const rank = raw?.file?.malware?.rank;
  return typeof rank === "string" && rank.length > 0 ? rank : null;
}

export type AptoideTrustVerdict = { trusted: true; rank: string } | { trusted: false; rank: string | null; reason: string };

/**
 * Whether ingestion may keep a response: only `file.malware.rank === "TRUSTED"`.
 * Anything else — `UNKNOWN`, `WARN`, `CRITICAL`, any other string, a missing
 * rank — is refused, with a reason the caller must log (never a silent skip).
 * A missing rank is refused rather than assumed clean.
 */
export function aptoideTrustVerdict(raw: Parameters<typeof aptoideScanRank>[0]): AptoideTrustVerdict {
  const rank = aptoideScanRank(raw);
  if (rank === APTOIDE_TRUSTED_RANK) return { trusted: true, rank };
  return {
    trusted: false,
    rank,
    reason: rank === null ? "no file.malware.rank in the response" : `file.malware.rank is "${rank.slice(0, 40)}", not "${APTOIDE_TRUSTED_RANK}"`,
  };
}

// --- Aptoide's own rating and download figure (5.h.vii.zi) ----------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A finite number >= 0 within the safe-integer range, floored; otherwise `null`. Strings, `NaN`, negatives and `Infinity` are not numbers here. */
function readCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) return null;
  return Math.floor(value);
}

const VOTE_STARS = [5, 4, 3, 2, 1] as const;

function readAptoideRating(value: unknown): ThirdPartyRating | null {
  if (!isPlainObject(value)) return null;
  const total = readCount(value.total);
  const average = value.avg;
  if (total === null || typeof average !== "number" || !Number.isFinite(average) || average < 0 || average > 5) return null;

  // The histogram is kept only when it is complete and adds up to `total`: a
  // partial or inconsistent one would draw bars that contradict the count.
  let votes: ThirdPartyRating["votes"] = null;
  if (Array.isArray(value.votes)) {
    const built: { star: 5 | 4 | 3 | 2 | 1; count: number }[] = [];
    for (const star of VOTE_STARS) {
      const entry = value.votes.find((v) => isPlainObject(v) && v.value === star);
      const count = isPlainObject(entry) ? readCount(entry.count) : null;
      if (count === null) break;
      built.push({ star, count });
    }
    if (built.length === VOTE_STARS.length && built.reduce((sum, v) => sum + v.count, 0) === total) votes = built;
  }
  return { average, total, votes };
}

/**
 * Aptoide's own rating (`stats.rating`) and download figure (`stats.downloads`),
 * or `null` when neither is usable. Pure; never throws; every part is validated
 * because the response is third-party data. **Reads nothing else from `stats`**
 * — `prating` and `pdownloads` are unexplained (see `AptoideRawApp.stats`).
 *
 * `downloads` is a *reported* figure: in the committed snapshot every value is a
 * round bucket and equals `pdownloads`, so it must never be presented as a count
 * D-Store or Aptoide measured.
 */
export function readAptoideStats(raw: { stats?: unknown } | null | undefined): ThirdPartyStats | null {
  const stats = raw?.stats;
  if (!isPlainObject(stats)) return null;
  const rating = readAptoideRating(stats.rating);
  const downloads = readCount(stats.downloads);
  return rating === null && downloads === null ? null : { rating, downloads };
}

// --- Field mappings -----------------------------------------------------

/**
 * SDK level → Android version name, for the handful of levels Aptoide
 * apps in practice report as a `min sdk`. Not exhaustive back to API 1
 * — this is a real, checkable mapping (Android's own published API
 * level table), not an invented one, extended as new levels show up in
 * ingested data rather than front-loaded for versions this catalog
 * will never see.
 */
const SDK_TO_ANDROID_VERSION: Record<number, string> = {
  21: "5.0", 22: "5.1", 23: "6.0", 24: "7.0", 25: "7.1",
  26: "8.0", 27: "8.1", 28: "9", 29: "10", 30: "11",
  31: "12", 32: "12L", 33: "13", 34: "14", 35: "15",
};

function sdkToAndroidVersion(sdk: number | undefined): string {
  if (!sdk) return "Not provided";
  return SDK_TO_ANDROID_VERSION[sdk] ?? `API ${sdk}`;
}

/**
 * Package name → D-Store category mapping — leaf `5.h.ii.zo` (cont.),
 * operator priority override. Aptoide's raw response carries no
 * category field at all (confirmed against every `app/get` response in
 * `aptoide-batch.txt`, not assumed), so this can't be derived from the
 * API the way `mapContentRating`/`sdkToAndroidVersion` derive from real
 * fields above. Instead it's transcribed directly from the operator's
 * own curl batch: each fetch in `aptoide-batch.txt` is labelled
 * `=== <category> :: app/get/package_name=<pkg>/aab=1`, one real,
 * hand-picked package per D-Store category (`lib/mock-data.ts`'s
 * `categories`). This is a real editorial mapping, not guessed or
 * evenly spread for variety — same honesty posture as
 * `available_regions`/`content_rating` elsewhere in this file.
 *
 * `com.mojang.minecraftpe` (intended for "games") returned a genuine
 * Aptoide 404 (`APP-1: Application 'package:com.mojang.minecraftpe'
 * not found`) — not ingested. "games" has no third-party entry until a
 * real, resolvable package is chosen; left empty rather than backfilled
 * with an invented one, matching this codebase's existing
 * zero-apps-is-honest precedent (see `apps`'s header comment in
 * `mock-data.ts`).
 */
const CATEGORY_BY_PACKAGE: Record<string, string> = {
  "com.termux": "system",
  "org.videolan.vlc": "multimedia",
  "org.mozilla.firefox": "internet",
  "com.whatsapp": "internet", // 5.h.ii.zi's original probe seed — Firefox already anchors "internet"; a messaging app fits the same shelf, not a forced fit
  "com.waze": "navigation",
  "org.khanacademy.android": "science-education",
  "com.gau.go.launcherex": "theming",
  "com.better.alarm": "time",
  "org.readera": "reading",
  "md.obsidian": "writing",
  "com.github.android": "development",
  "org.totschnig.myexpenses": "finance",
};

/**
 * `5.i.vi.zo` — the curated table above still holds the twelve legacy slugs
 * it was written with; they are translated to the Play vocabulary by `toPlay`
 * (`LEGACY_TO_PLAY`, the one mapping), not re-typed here, so there is no
 * second table to keep in step. Returns `null` for a package that is not in
 * the table (not yet in the operator's curated batch).
 *
 * **Decision (recorded): an unmapped package is `uncategorized`, not
 * `internet`/Communication.** The old `internet` fallback was a guess that
 * put any unknown package on the Communication shelf, and a wrong shelf is
 * worse than no shelf: it would surface, say, a game or a bank app next to
 * messaging apps and feed the For You shelf a false interest. Its
 * `app_type` is `app`, because nothing tells us a package is a game.
 * Today it changes nothing visible: all twelve snapshot packages are mapped.
 */
function categoryForPackage(packageName: string): string | null {
  return Object.prototype.hasOwnProperty.call(CATEGORY_BY_PACKAGE, packageName) ? CATEGORY_BY_PACKAGE[packageName] : null;
}

/** Where an Aptoide app is shelved, and how that was decided. `via` is `package`, `keywords` or `none`. */
export interface AptoidePlacement {
  app_type: AppType;
  category: string;
  /** The curated table's own string, kept when `toPlay` did not recognize it; otherwise `null`. */
  category_raw: string | null;
  via: "package" | "keywords" | "none";
}

/**
 * `5.l.viii.zo` — the one place an Aptoide app's `{ app_type, category }` is decided, used by
 * `normalizeAptoideApp` and by the re-derive script (`lib/catalog-rederive.ts`), so a stored row and a freshly
 * normalized app cannot disagree. Order, first answer wins:
 *  1. `CATEGORY_BY_PACKAGE` (the operator's hand-picked packages), through `toPlay`. A curated value `toPlay`
 *     does not know stays `uncategorized` with the string kept in `category_raw`; it does NOT fall through to
 *     the keywords, because the operator picked that package by hand.
 *  2. `categoryFromKeywords(raw.media.keywords)` (exact word match, fixed priority, a game needs a genre).
 *  3. `uncategorized`, `app_type` `app` (a wrong shelf is worse than none, `5.i.vi.zo`).
 * Never throws, whatever `raw` is.
 */
export function placeAptoideApp(raw: AptoideRawApp): AptoidePlacement {
  const packageName = typeof raw?.package === "string" ? raw.package : "";
  const mappedCategory = categoryForPackage(packageName);
  if (mappedCategory !== null) {
    const placed = toPlay(mappedCategory);
    const categoryRaw =
      placed.via === "unknown" && mappedCategory.length > 0 ? mappedCategory.slice(0, CATEGORY_RAW_MAX) : null;
    return { app_type: placed.app_type, category: placed.category, category_raw: categoryRaw, via: "package" };
  }
  const fromKeywords = categoryFromKeywords(raw?.media?.keywords);
  if (fromKeywords !== null) {
    return { app_type: fromKeywords.app_type, category: fromKeywords.category, category_raw: null, via: "keywords" };
  }
  return { app_type: "app", category: UNCATEGORIZED.slug, category_raw: null, via: "none" };
}

/**
 * Aptoide's `age.title` is already an English label ("Everyone", "Teen",
 * etc.) for most entries, so this maps by PEGI rating number where
 * `title` is missing or doesn't match our closed union, rather than
 * inventing a rating. Falls back to the most conservative tier
 * ("Adults only 18+") only when nothing usable is present, so an
 * unrated app is never accidentally shown as safe for everyone.
 */
const KNOWN_RATING_TITLES: ContentRating[] = ["Everyone", "Everyone 10+", "Teen", "Mature 17+", "Adults only 18+"];

/** `5.h.iii.zo` — true when `mapContentRating` would have to fall back to its conservative default instead of deriving a value from the response. */
function hasUsableAge(age: AptoideAge | undefined): boolean {
  return (
    (age?.title !== undefined && (KNOWN_RATING_TITLES as string[]).includes(age.title)) ||
    age?.rating !== undefined
  );
}

function mapContentRating(age: AptoideAge | undefined): ContentRating {
  const knownTitles = KNOWN_RATING_TITLES;
  if (age?.title && (knownTitles as string[]).includes(age.title)) {
    return age.title as ContentRating;
  }
  const pegi = age?.rating;
  if (pegi === undefined) return "Adults only 18+"; // unrated → most conservative, not "Everyone"
  if (pegi <= 3) return "Everyone";
  if (pegi <= 7) return "Everyone 10+";
  if (pegi <= 12) return "Teen";
  if (pegi <= 16) return "Mature 17+";
  return "Adults only 18+";
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * `Aptoide's file.signature.sha1` is a real certificate fingerprint —
 * but it's SHA-1, and `SignatureInfo.tsx`'s label is hardcoded
 * "Signing certificate fingerprint (SHA-256)". Rendering a SHA-1 value
 * under a SHA-256 label would be a real inaccuracy, not just a missing
 * field, so this deliberately does NOT map `signature.sha1` into
 * `signing_certificate_fingerprint` — it's left "Not provided" until
 * either `SignatureInfo.tsx` is made algorithm-aware or (per
 * HANDOVER.md `5.h.iii.zi`) the whole "Verify this APK" block is
 * suppressed for third-party apps, which is the documented plan
 * anyway. `sha256_checksum` is "Not provided" for the same class of
 * reason: Aptoide gives `md5sum`, not a SHA-256 of the APK.
 */
/**
 * `5.h.iii.zi` — third-party downloads go to Aptoide's own delivery,
 * never through this store. Only an `https://` URL is accepted; anything
 * else (missing, empty, another scheme) becomes `""` so a malformed
 * snapshot entry can't turn the download button into a `javascript:` or
 * otherwise unexpected link.
 */
function aptoideDownloadUrl(raw: AptoideRawApp): string {
  const candidate = raw.file.path || raw.file.path_alt || "";
  return candidate.startsWith("https://") ? candidate : "";
}

/**
 * `5.h.iii.zo` — Aptoide's `file.used_permissions` is real permission
 * data, so it's mapped rather than shown as "Not provided". Stripped of
 * the `android.permission.` prefix to match the short form the rest of
 * the catalog uses (`WRITE_EXTERNAL_STORAGE`); vendor/other-namespace
 * permissions keep their full name. `undefined` (key absent from the
 * response) is different from `[]` (the app genuinely requests none),
 * which is exactly the distinction "Not provided" exists for.
 */
function mapPermissions(used: string[] | undefined): string[] | null {
  if (!used) return null;
  return [...new Set(used.map((p) => p.replace(/^android\.permission\./, "")))];
}

export function normalizeAptoideApp(raw: AptoideRawApp): App {
  const slug = raw.uname || slugify(raw.name);
  const developerName = raw.developer?.name?.trim() || null;
  const sizeMb = Math.round((raw.file.filesize / (1024 * 1024)) * 10) / 10;
  const description = raw.media.description?.trim() || raw.media.summary?.trim() || "No description provided.";
  const summary = raw.media.summary?.trim() || description.split("\n")[0].slice(0, 160);

  const dataSafety: DataSafetyInfo = {
    collects_data: false,
    data_types: [],
    shared_with_third_parties: false,
    data_encrypted_in_transit: false,
    can_request_data_deletion: false,
    provided: false, // Aptoide has no Play-style data-safety disclosure — see DataSafetyInfo's field comment
  };

  const nowIso = new Date().toISOString();

  // 5.h.iii.zo — fields this source did not provide. Each one still gets
  // a typed placeholder below (the `App` fields are required) but the UI
  // renders "Not provided" for it via `isNotProvided`.
  const notProvided: NotProvidedField[] = [
    "play_store_status", // Aptoide says nothing about Play Store listing status (many of these apps ARE on Play)
    "monetization", // no ads / in-app-purchase flags — `appcoins.*` is Aptoide's own AppCoins billing, not "contains ads"/"IAP"
  ];
  
  // 5.h.v.zo — read version history if it was attached by the fetcher script
  const history = readVersionHistory(raw.versions);
  const permissions = mapPermissions(raw.file.used_permissions);
  if (permissions === null) notProvided.push("permissions");
  if (!raw.file.hardware?.sdk) notProvided.push("min_android_version");
  if (!hasUsableAge(raw.age)) notProvided.push("content_rating"); // the conservative "Adults only 18+" fallback stays as the stored value but is never displayed as if Aptoide had rated it

  // 5.l.viii.zo — `{ app_type, category }` from `placeAptoideApp`: the curated package table (through
  // `toPlay`, as `5.i.vi.zo` set up), then `media.keywords`, then `uncategorized`. A curated value `toPlay`
  // does not know (a typo added to the table) is `uncategorized` and the string is kept in `category_raw`.
  const placement = placeAptoideApp(raw);
  const appType = placement.app_type;
  const categorySlug = placement.category;
  const categoryRaw = placement.category_raw;

  const thirdPartyStats = readAptoideStats(raw);

  const app: App = {
    id: `aptoide-${raw.id}`,
    slug,
    name: raw.name,
    summary,
    description,
    site: raw.urls?.w ?? null,
    source: null, // Aptoide doesn't carry an upstream source-code repo link
    tracker: null,
    donate: null,
    icon: raw.icon,
    primary_color: "#4a4a4a", // no brand palette in Aptoide's response; theming (0.i) falls back per-category, not per-app, for third-party apps
    secondary_color: "#6a6a6a",
    tertiary_color: "#8a8a8a",
    apk: aptoideDownloadUrl(raw), // 5.h.iii.zi — Aptoide's own delivery URL, straight from the snapshot; empty when the response has no usable https path (the detail page then shows no download button rather than a dead one)
    version: raw.file.vername,
    license: "Not provided",
    is_published: true,
    category: categorySlug, // 5.i.vi.zo — a Play slug: CATEGORY_BY_PACKAGE's legacy value through toPlay
    ...(categoryRaw === null ? {} : { category_raw: categoryRaw }),
    app_type: appType, // 5.i.vi.zo — from toPlay, not derived from the legacy slug
    ...(thirdPartyStats === null ? {} : { third_party_stats: thirdPartyStats }), // 5.h.vii.zi — Aptoide's own reported rating and downloads; NOT this store's counters below, which stay 0
    ...(aptoideScanRank(raw) === null ? {} : { third_party_scan_rank: aptoideScanRank(raw) as string }), // 5.h.iv.zo — Aptoide's own scan rank, carried as reported and labelled as Aptoide's on the detail page
    created_at: raw.added || nowIso,
    updated_at: raw.modified || nowIso,

    install_count: 0, // this store's own counter — starts at 0 for a newly ingested app, per 3.b's "app-native counters" decision, not borrowed from Aptoide's own download count
    view_count: 0,
    avg_rating: 0,
    rating_count: 0,
    is_featured: false, // editorial calls are first-party-only, per 5.g.v — third-party apps are never featured/editor's-pick
    is_editors_pick: false,
    sponsored_slots: [], // 5.j.ii.zi — sponsored placement is a first-party Console feature; same "first-party-only" posture as the two flags above
    collections: [], // 5.j.ii.zo — collection membership is a first-party Console feature; same posture as the flags/sponsorship above
    developer_verified: false, // 5.g.iii.zi — Aptoide has no verified-developer/agreement relationship with D-Store to attest to; same "editorial calls are first-party-only" posture as the two flags above
    min_android_version: sdkToAndroidVersion(raw.file.hardware?.sdk),
    rollout_percentage: 100, // 5.c.iv.zo — staged rollout is a first-party Console feature; same posture as the editorial/sponsorship/collections defaults above
    rollout_status: "complete",
    release_id: String(raw.file.vercode), // this source's own closest analogue to a release id; never actually used to gate anything since rollout_percentage is always 100 here, kept non-empty so the field is never a lie-by-omission
    size_mb: sizeMb,
    sha256_checksum: "Not provided",
    signing_certificate_fingerprint: "Not provided",
    play_store_rejection_reason: null,
    permissions: permissions ?? [],
    screenshots: (raw.media.screenshots ?? []).map((s) => s.url),
    changelog: raw.media.news?.trim() || "No changelog provided.",

    // A null/blank (or non-Latin, so slug-less) developer name must not throw: one bad entry took every page down.
    // Such apps get an honest "Unknown developer" label and a slug of their own, never a shared bucket that would
    // present unrelated apps as one publisher.
    developer_slug: (developerName && slugify(developerName)) || `unknown-${slug}`,
    developer_name: developerName ?? "Unknown developer", // 5.h.iii.zi — no static Developer row exists for third-party publishers
    developer_website: raw.developer?.website ?? null, // 5.h.iv.zi — feeds the derived Developer.profile_url (lib/catalog.ts getDeveloperBySlug)

    available_regions: [...ALL_REGIONS], // Aptoide's response carries no per-country availability; conservative default, same as most first-party dummy entries

    content_rating: mapContentRating(raw.age),
    data_safety: dataSafety,
    contains_ads: false, // placeholder only — "monetization" is in not_provided; the old `appcoins.advertising ?? false` mapping claimed "no ads" for apps like Waze
    has_in_app_purchases: false, // same: placeholder, shown as "Not provided"

    origin: APTOIDE_ORIGIN,
    package_name: raw.package,
    not_provided: notProvided,
    ...(history.entries.length > 0 ? { version_history: history.entries, version_history_omitted: history.omitted } : {}),
  };

  return app;
}

// --- Live fetch (used by scripts/ingest-aptoide.ts, not by the app at request time) ---

async function aptoideGet(path: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/${path}`, {
    headers: { "User-Agent": "d-store-ingest/0.1" },
  });
  if (!res.ok) {
    throw new Error(`Aptoide API ${path} → HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchAptoideApp(packageName: string): Promise<AptoideRawApp | null> {
  const json = (await aptoideGet(`app/get/package_name=${encodeURIComponent(packageName)}/aab=1`)) as {
    nodes?: { meta?: { data?: AptoideRawApp } };
  };
  return json.nodes?.meta?.data ?? null;
}

export async function fetchAptoideSearch(query: string, limit = 10): Promise<AptoideRawApp[]> {
  const json = (await aptoideGet(`apps/search/query=${encodeURIComponent(query)}/limit=${limit}`)) as {
    datalist?: { list?: AptoideRawApp[] };
  };
  return json.datalist?.list ?? [];
}

// --- No request-time reader (leaf 5.l.xix.zo) ---
//
// This file used to end with `createAptoideSource()` and a `loadSnapshot()` that read
// `storage/downloads/aptoide-snapshot*.json` on every cold start. The storefront no longer reads the
// snapshot at all: third-party apps come from the `catalog_app` table (`lib/sources/catalog-table.ts`,
// `lib/catalog-table.ts`). The snapshot files stay in the repo as import data for the scripts
// (`scripts/load-catalog-table.ts`, `check-catalog-table.ts`, `rederive-catalog-categories.ts`, the crawl
// workflow), which read them through `lib/aptoide-snapshot-io.ts`.
