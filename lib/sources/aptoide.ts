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

import type { App, AppOrigin, ContentRating, DataSafetyInfo } from "../mock-data";
import { ALL_REGIONS } from "../mock-data";
import type { CatalogSource } from "./types";

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
  signature?: AptoideSignature;
  hardware?: { sdk?: number };
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
  developer: { id: number; name: string; website?: string | null };
  file: AptoideFile;
  media: {
    description?: string;
    summary?: string;
    news?: string; // changelog-shaped free text
    screenshots?: { url: string }[];
  };
  age?: AptoideAge;
  appcoins?: AptoideAppcoins;
  malware?: { rank?: string }; // "TRUSTED" | "UNKNOWN" | ...
  urls?: { w?: string };
  added: string;
  modified: string;
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

function categoryForPackage(packageName: string): string {
  return CATEGORY_BY_PACKAGE[packageName] ?? "internet"; // unmapped package (not yet in the operator's curated batch) — same fallback the old hardcoded placeholder used
}

/**
 * Aptoide's `age.title` is already an English label ("Everyone", "Teen",
 * etc.) for most entries, so this maps by PEGI rating number where
 * `title` is missing or doesn't match our closed union, rather than
 * inventing a rating. Falls back to the most conservative tier
 * ("Adults only 18+") only when nothing usable is present, so an
 * unrated app is never accidentally shown as safe for everyone.
 */
function mapContentRating(age: AptoideAge | undefined): ContentRating {
  const knownTitles: ContentRating[] = ["Everyone", "Everyone 10+", "Teen", "Mature 17+", "Adults only 18+"];
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
export function normalizeAptoideApp(raw: AptoideRawApp): App {
  const slug = raw.uname || slugify(raw.name);
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
    apk: "", // resolved to Aptoide's own delivery at render time by 5.h.iii.zi's trust labelling, not stored as a static field here
    version: raw.file.vername,
    license: "Not provided",
    is_published: true,
    category: categoryForPackage(raw.package), // real mapping — see CATEGORY_BY_PACKAGE above
    created_at: raw.added || nowIso,
    updated_at: raw.modified || nowIso,

    install_count: 0, // this store's own counter — starts at 0 for a newly ingested app, per 3.b's "app-native counters" decision, not borrowed from Aptoide's own download count
    view_count: 0,
    avg_rating: 0,
    rating_count: 0,
    is_featured: false, // editorial calls are first-party-only, per 5.g.v — third-party apps are never featured/editor's-pick
    is_editors_pick: false,
    min_android_version: sdkToAndroidVersion(raw.file.hardware?.sdk),
    size_mb: sizeMb,
    sha256_checksum: "Not provided",
    signing_certificate_fingerprint: "Not provided",
    play_store_rejection_reason: null,
    permissions: [],
    screenshots: (raw.media.screenshots ?? []).map((s) => s.url),
    changelog: raw.media.news?.trim() || "No changelog provided.",

    developer_slug: slugify(raw.developer.name),

    available_regions: [...ALL_REGIONS], // Aptoide's response carries no per-country availability; conservative default, same as most first-party dummy entries

    content_rating: mapContentRating(raw.age),
    data_safety: dataSafety,
    contains_ads: raw.appcoins?.advertising ?? false,
    has_in_app_purchases: raw.appcoins?.billing ?? false,

    origin: APTOIDE_ORIGIN,
    package_name: raw.package,
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

// --- CatalogSource: reads the ingestion snapshot, never calls the API live ---

/**
 * Loads `storage/downloads/aptoide-snapshot.json` (written by
 * `scripts/ingest-aptoide.ts`) and normalizes every entry. Missing
 * snapshot file → empty catalog, not an error — matches
 * `getActiveSponsoredSlot`'s "empty is a valid state" pattern
 * elsewhere in this codebase, and lets the app run before an ingest
 * has ever been run.
 */
export function createAptoideSource(): CatalogSource {
  return {
    origin: APTOIDE_ORIGIN,
    async getApps(): Promise<App[]> {
      const raw = await loadSnapshot();
      return raw.map(normalizeAptoideApp);
    },
  };
}

let cachedSnapshot: AptoideRawApp[] | null = null;

async function loadSnapshot(): Promise<AptoideRawApp[]> {
  if (cachedSnapshot) return cachedSnapshot;
  try {
    // Dynamic import so this module still loads fine in environments
    // (e.g. `next build`'s edge/client graph analysis) where `fs` and
    // `path` aren't available — the snapshot is only ever read
    // server-side.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = path.join(process.cwd(), "storage", "downloads", "aptoide-snapshot.json");
    const text = await fs.readFile(file, "utf-8");
    cachedSnapshot = JSON.parse(text) as AptoideRawApp[];
  } catch {
    cachedSnapshot = []; // no snapshot yet — see function comment
  }
  return cachedSnapshot;
}
