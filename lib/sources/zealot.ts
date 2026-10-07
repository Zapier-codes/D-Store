/**
 * Zealot signed-catalog-index reader — leaf `5.g.i.zi`.
 *
 * Fetches Zealot's published `index.json` + `index.json.sig` (Task
 * 27b-iii's publish target on Zealot's side: a public GitHub Pages repo,
 * one commit per publish, confirmed by reading
 * `app/services/catalog_index/publish.rb` and `github_pages_commit.rb` in
 * the Zealot repo this session), verifies the detached Ed25519 signature
 * against this repo's OWN pinned key(s) (`lib/sources/zealot-trust.ts` —
 * `5.g.iv.zo`; Zealot's own bundled `signing_key.pub` is never fetched or
 * trusted here, per that leaf's whole point), checks
 * `schema_version`/`expires_at`/anti-rollback, then normalizes each v2 app
 * entry into this repo's `App` shape — the same seam pattern
 * `lib/sources/aptoide.ts` already established for a second source.
 *
 * `lib/catalog.ts`'s `createZealotSource()` header comment already
 * committed to this exact swap ("When `5.g.i.zi` lands, only this
 * function's body changes"); wiring that swap into `lib/catalog.ts` is
 * this leaf's last step, done alongside this file.
 *
 * ❓ open: the actual base URL `index.json`/`index.json.sig` are served
 * from is `CATALOG_PAGES_REPO`+`CATALOG_PAGES_BRANCH` on Zealot's side —
 * an operator-set secret on Render, not committed in either repo (Zealot's
 * `github_pages_commit.rb` only ever reads it from `ENV`, confirmed this
 * session). Read here the same way, as `ZEALOT_CATALOG_INDEX_BASE_URL` —
 * unset means "no live source configured yet," the same honest
 * empty-catalog fallback `lib/sources/aptoide.ts` already uses for a
 * missing snapshot file, not an error.
 *
 * `6.b.ii.zo` — which index this reader resolves against is now a
 * per-tenant value (`CatalogScope`, below), not one process-wide env var.
 * The default tenant's scope is still exactly that env var, with the same
 * cache/state files it always used, so nothing changes until a second
 * tenant is configured.
 */

import type { App, AppOrigin, BaseStats, CarriedOverReview, Collection, ContentRating, DataSafetyInfo, NotProvidedField } from "../mock-data";
import { readVersionStatus } from "../version-advisory";
import { readVersionHistory } from "../version-history";
import { CATEGORY_RAW_MAX, checkCategory, toPlay, UNCATEGORIZED, type AppType } from "../taxonomy";
import { ALL_REGIONS } from "../mock-data";
import { DEFAULT_TENANT_ID, type TenantConfig } from "../tenant-config";
import type { CatalogSource } from "./types";
import { verifySignature, isRollback, isExpired, SUPPORTED_SCHEMA_VERSION, type IndexState } from "./zealot-trust";

const ZEALOT_ORIGIN: AppOrigin = "zealot";

// The default tenant keeps the original file names (the build-time snapshot script,
// `scripts/snapshot-zealot-index.ts`, and `outputFileTracingIncludes` both depend on them).
// Every other tenant gets its own pair, keyed by `tenant_id` (which `TENANT_ID_PATTERN` in
// `lib/tenant-config.ts` restricts to `[a-z0-9-]`, so it's always a safe file-name fragment):
// a shared anti-rollback state file would make two unrelated indexes look like rollbacks of
// each other, and a shared cache would let one tenant's catalog be served as another's.
const STATE_FILE = ["storage", "downloads", "zealot-index-state.json"];
const CACHE_FILE = ["storage", "downloads", "zealot-index-cache.json"];

function stateFileFor(tenantId: string): string[] {
  return tenantId === DEFAULT_TENANT_ID ? STATE_FILE : ["storage", "downloads", `zealot-index-state.${tenantId}.json`];
}
function cacheFileFor(tenantId: string): string[] {
  return tenantId === DEFAULT_TENANT_ID ? CACHE_FILE : ["storage", "downloads", `zealot-index-cache.${tenantId}.json`];
}

// --- Per-tenant catalog scope (6.b.ii.zo) --------------------------------

/**
 * Which signed index a reader resolves against, and under which tenant's cache/anti-rollback
 * state. `baseUrl: null` means "no first-party Zealot source for this scope."
 */
export interface CatalogScope {
  tenantId: string;
  baseUrl: string | null;
}

/**
 * Tenant -> catalog scope. Pure (the env is a parameter).
 *
 * - **Default tenant:** `ZEALOT_CATALOG_INDEX_BASE_URL`, exactly as before this leaf. An unset
 *   value still means "no live fetch," and the reader still falls back to the last verified disk
 *   cache (which is how the build-time snapshot reaches a runtime with no env var set).
 * - **Any other tenant:** its own `catalog_index_base_url` and nothing else. Absent/`null`/`""`
 *   means the tenant has no Zealot source (per `tenant-config.schema.json`: nothing to fetch,
 *   not an error) — it does NOT fall back to the default tenant's index or cache, which would
 *   show one tenant's catalog under another's brand. Non-`https://` values are refused here as
 *   well as in `validateTenantRecord` (this is the last line before a `fetch`).
 */
export function catalogScopeForTenant(
  tenant: Pick<TenantConfig, "tenant_id" | "catalog_index_base_url">,
  env: Record<string, string | undefined> = process.env,
): CatalogScope {
  if (tenant.tenant_id === DEFAULT_TENANT_ID) {
    return { tenantId: DEFAULT_TENANT_ID, baseUrl: env.ZEALOT_CATALOG_INDEX_BASE_URL?.trim() || null };
  }
  const url = tenant.catalog_index_base_url?.trim();
  return { tenantId: tenant.tenant_id, baseUrl: url && url.startsWith("https://") ? url : null };
}

/** Stable identity of a scope: same tenant + same index URL. Also what `lib/catalog.ts` keys its merged-catalog cache on. */
export function catalogScopeKey(scope: CatalogScope): string {
  return `${scope.tenantId}\n${scope.baseUrl ?? ""}`;
}

// --- Raw v2 envelope (only the fields this reader actually reads; see
// docs/catalog_index_v2.md / .schema.json in the Zealot repo for the full
// shape) ---------------------------------------------------------------

interface RawDataSafety {
  collects_data: boolean | null;
  data_types: string[];
  shared_with_third_parties: boolean | null;
  encrypted_in_transit: boolean | null;
  deletion_request_url: string | null;
}

export interface RawVersion {
  release_id: string | number | null;
  version_name: string | null;
  download_url: string | null;
  sha256: string | null;
  size_bytes: number | null;
  signing_fingerprint: string | null;
  changelog: string | null;
  compatibility: { min_sdk: number | null };
  /**
   * `5.c.iv.zo` — Zealot's `30f`. Optional/defaulted here, same
   * conservative posture `editorial`/`sponsored_slots` below already
   * take for an older cached index that predates a field: an index
   * snapshotted before Zealot's `30f` landed has no `rollout` key at
   * all, and that must read as fully-available, not as a hard zero.
   */
  rollout?: { percentage: number; status: "active" | "halted" | "complete" } | null;
  /**
   * `5.c.vii.zo` — the release's lifecycle status (Zealot Task 27f-a), distinct
   * from `rollout.status`. Optional here: an older cached index has none, and
   * `readVersionStatus` reads that as `"available"`.
   */
  status?: "available" | "halted" | "pulled" | null;
}

export interface RawApp {
  id: string | number;
  package_name: string | null;
  /**
   * `verified` — leaf `5.g.iii.zi`. The Console's own developer/
   * agreement-status attestation (docs/D-STORE.md §7's "publisher and
   * verified-developer flag"); `null`/absent means the Console hasn't
   * set it, treated the same conservative way as every other
   * not-yet-populated boolean this reader reads (falls to `false`
   * below, never assumed true).
   */
  publisher: { name: string; profile_url: string | null; verified: boolean | null };
  listing: {
    title: string;
    description: string | null;
    icon: { url: string | null };
    /** Phone screenshots in display order (Zealot Task 27d-e1). Absent on an older cached index. */
    screenshots?: { url: string | null; sha256?: string | null; alt?: string | null }[] | null;
    content_rating: string | null;
    data_safety: RawDataSafety;
    contains_ads: boolean | null;
    has_in_app_purchases: boolean | null;
  };
  slug: string;
  summary: string | null;
  category: string | null;
  license: string | null;
  links: { site: string | null; source: string | null; tracker: string | null; donate: string | null };
  available_regions: string[] | null;
  created_at: string;
  updated_at: string;
  /** Newest first — matches `App#catalog_releases`'s documented order on the Zealot side, so `versions[0]` (never a re-sort here) is always the latest. */
  versions: RawVersion[];
  /**
   * Task 31a's editorial block — leaf `5.g.v.zi`. Absent/`null` fields
   * mean the Console hasn't set an editorial flag yet, same
   * conservative "falls to `false`, never assumed true" posture this
   * reader already uses for `publisher.verified` just above.
   */
  editorial?: { featured: boolean | null; editors_pick: boolean | null } | null;
  /**
   * Sponsored-placement windows — leaf `5.j.ii.zi`. Required on the
   * Zealot side (`catalog_index_v2.schema.json`'s `$defs/app` lists it
   * under `required`), but read as optional/defaulted-to-`[]` here —
   * same conservative posture this reader already takes for `editorial`
   * just above, in case an older cached index predates this field.
   */
  sponsored_slots?: { starts_at: string; ends_at: string }[];
  /**
   * Collection membership — leaf `5.j.ii.zo`. Slugs into the index's
   * own top-level `collections` registry (`RawIndex.collections`
   * below). Optional/defaulted-to-`[]` here, same conservative posture
   * `sponsored_slots` just above already takes for an older cached
   * index that predates a field.
   */
  collections?: string[];
  /**
   * Task 45b — the neutral `base_stats` Zealot publishes for an app that was
   * distributed by hand before it was listed. Optional/defaulted-to-`null` here,
   * same conservative posture `editorial` above takes for an older cached index.
   */
  base_stats?: { downloads: number | null; rating: { average: number | null; count: number | null } | null } | null;
  /**
   * Task 45d — comments the app earned before it was listed, oldest first.
   * Optional/defaulted-to-`[]` here, same conservative posture as the fields
   * above for an older cached index.
   */
  reviews?: { author_name: string | null; rating: number | null; body: string | null; commented_on: string | null; helpful_count: number | null }[] | null;
}

/**
 * Editorial-collection registry — leaf `5.j.ii.zo`. The Console's own
 * authored `slug`/`name`/`description` per collection
 * (`catalog_index_v2.schema.json`'s `$defs/collection`, confirmed
 * landed by Task 31a — see `HANDOVER.md`'s `5.g.v.zi` note); each
 * `RawApp.collections` entry above is a slug resolving against this
 * list, not a separate per-app name/description of its own.
 */
export interface RawCollection {
  slug: string;
  name: string;
  description: string;
}

export interface RawIndex {
  schema_version: number;
  generated_at: string;
  sequence: number;
  expires_at: string;
  apps: RawApp[];
  /**
   * Top-level collection registry — leaf `5.j.ii.zo`. Optional/
   * defaulted-to-`[]` at every read site below, same posture every
   * other possibly-missing-on-an-older-cache field in this file uses —
   * an index generated before Task 31a's collections work predates it
   * entirely, not just predates individual apps' membership in it.
   */
  collections?: RawCollection[];
}

// --- Normalization --------------------------------------------------------

/** Same "unrated -> most conservative, never invented as safe" precedent `lib/sources/aptoide.ts` already set. */
const KNOWN_RATINGS: readonly ContentRating[] = ["Everyone", "Everyone 10+", "Teen", "Mature 17+", "Adults only 18+"];

function mapContentRating(raw: string | null): ContentRating {
  if (raw && (KNOWN_RATINGS as readonly string[]).includes(raw)) return raw as ContentRating;
  return "Adults only 18+";
}

function slugifyName(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "developer";
}

/**
 * 5.i.vii.zi — places the `category` string Zealot's signed index carries on the two-axis
 * taxonomy. Pure; never throws; producers control the input.
 *
 * Zealot's v2 schema publishes `category` as Play's own enum naming (`art_and_design`,
 * `communications`, `game_action`, ...; `docs/catalog_index_v2.schema.json` @ Zealot `2af75cba`)
 * and has NO `app_type` field, so `app_type` is derived here: a `game_` prefix means `game`,
 * anything else `app`. (When Zealot publishes `app_type`, read it in preference to this.)
 * The enum is turned into this repo's vocabulary slug (underscores -> hyphens; `game_` stripped;
 * Play's `communications` is this repo's `communication`) and then CHECKED against the
 * vocabulary for the derived type, so nothing is trusted just because it has the right shape.
 *
 * Order, first match wins:
 *  1. a Zealot enum value that maps into the vocabulary -> that pair;
 *  2. anything `toPlay` already understands (a Play slug, or a legacy slug from an old cached
 *     index) -> `toPlay`'s pair, so `LEGACY_TO_PLAY` stays the one legacy mapping;
 *  3. an ABSENT value (`null`, `undefined`, `""`, non-string) -> `uncategorized`, no raw kept.
 *     **Decision (recorded): Zealot's old `internet` default is gone.** An app the Console has
 *     not categorized is `uncategorized`, not Communication: a wrong shelf is worse than none,
 *     and the guess would feed the For You shelf a false interest (same call as Aptoide's
 *     unmapped package, `5.i.vi.zo`);
 *  4. a present string nobody recognizes -> `uncategorized`, the string kept (cut to
 *     `CATEGORY_RAW_MAX`) in `category_raw`.
 */
export function placeZealotCategory(raw: unknown): { app_type: AppType; category: string; category_raw: string | null } {
  if (typeof raw !== "string" || raw.length === 0) {
    return { app_type: "app", category: UNCATEGORIZED.slug, category_raw: null };
  }
  const isGame = raw.startsWith("game_");
  const appType: AppType = isGame ? "game" : "app";
  let slug = (isGame ? raw.slice("game_".length) : raw).replace(/_/g, "-");
  if (!isGame && slug === "communications") slug = "communication";
  if (checkCategory(appType, slug).known) return { app_type: appType, category: slug, category_raw: null };

  const placed = toPlay(raw);
  if (placed.via !== "unknown") return { app_type: placed.app_type, category: placed.category, category_raw: null };

  return { app_type: "app", category: UNCATEGORIZED.slug, category_raw: raw.slice(0, CATEGORY_RAW_MAX) };
}

function normalizeZealotApp(raw: RawApp): App {
  const nowIso = new Date().toISOString();
  const latest = raw.versions[0];

  const description = raw.listing.description?.trim() || "No description provided.";
  const summary = raw.summary?.trim() || description.split("\n")[0].slice(0, 160);

  // 5.h.iii.zo-style "Not provided" bookkeeping, same convention
  // lib/sources/aptoide.ts already established: v2's schema simply has no
  // top-level `permissions`/`play_store_status` concept yet (only a
  // reserved, always-empty `compatibility.permissions` per version), so
  // both are unconditionally "not provided" today, not derived from
  // anything in the response.
  const notProvided: NotProvidedField[] = ["permissions", "play_store_status", "monetization"];
  if (!latest?.compatibility?.min_sdk) notProvided.push("min_android_version");
  if (!raw.listing.content_rating) notProvided.push("content_rating");

  const rawSafety = raw.listing.data_safety;
  const dataSafety: DataSafetyInfo = {
    collects_data: rawSafety.collects_data ?? false,
    data_types: rawSafety.data_types ?? [],
    shared_with_third_parties: rawSafety.shared_with_third_parties ?? false,
    data_encrypted_in_transit: rawSafety.encrypted_in_transit ?? false,
    can_request_data_deletion: Boolean(rawSafety.deletion_request_url),
    provided:
      rawSafety.collects_data !== null ||
      rawSafety.shared_with_third_parties !== null ||
      rawSafety.encrypted_in_transit !== null,
  };

  // 5.i.vii.zi — Play slug and real `app_type` from the index's category (see `placeZealotCategory`).
  const placed = placeZealotCategory(raw.category);

  const history = readVersionHistory(raw.versions);
  const app: App = {
    id: `zealot-${raw.id}`,
    slug: raw.slug,
    name: raw.listing.title,
    summary,
    description,
    site: raw.links.site,
    source: raw.links.source,
    tracker: raw.links.tracker,
    donate: raw.links.donate,
    icon: raw.listing.icon.url ?? "", // no real icon yet (27d reserved) -- AppIcon.tsx's isRealImageUrl check falls back to its generated tile for anything that isn't a real https URL
    primary_color: "#4a4a4a",
    secondary_color: "#6a6a6a",
    tertiary_color: "#8a8a8a",
    apk: latest?.download_url ?? "",
    version: latest?.version_name ?? "Not provided",
    license: raw.license ?? "Not provided",
    is_published: true,
    category: placed.category, // 5.i.vii.zi — a Play slug; an absent category is "uncategorized", an unrecognized one too (kept in category_raw)
    ...(placed.category_raw === null ? {} : { category_raw: placed.category_raw }),
    app_type: placed.app_type, // 5.i.vii.zi — derived from the index's category (`game_` prefix); the v2 index has no app_type field yet
    created_at: raw.created_at || nowIso,
    updated_at: raw.updated_at || nowIso,

    install_count: 0, // this store's own counter -- same "starts at 0, never borrowed" rule lib/sources/aptoide.ts already set
    view_count: 0,
    avg_rating: 0,
    rating_count: 0,
    // 5.g.v.zi -- read straight through from the Console's signed index;
    // this repo stays write-free on the editorial side (see
    // `setAppFeaturing` in `lib/catalog.ts`, now disabled). Missing/null
    // on Zealot's side still falls to `false`, never invented as true.
    is_featured: raw.editorial?.featured ?? false,
    is_editors_pick: raw.editorial?.editors_pick ?? false,
    // 5.j.ii.zi -- read straight through from the Console's signed index,
    // same "this repo stays write-free" posture as the two flags above;
    // authoring moved to the Console (5.j.i.zo), not a local admin tool.
    sponsored_slots: raw.sponsored_slots ?? [],
    // 5.j.ii.zo -- read straight through, same "this repo stays
    // write-free" posture as sponsored_slots/is_featured/is_editors_pick
    // just above; authoring lives in the Console, not a local admin tool.
    collections: raw.collections ?? [],
    developer_verified: raw.publisher.verified ?? false, // 5.g.iii.zi -- the Console's own developer/agreement-status flag, read straight through; unset is "not verified", not an error
    min_android_version: latest?.compatibility?.min_sdk ? `API ${latest.compatibility.min_sdk}` : "Not provided",
    size_mb: latest?.size_bytes ? Math.round((latest.size_bytes / (1024 * 1024)) * 10) / 10 : 0,
    sha256_checksum: latest?.sha256 ?? "Not provided",
    signing_certificate_fingerprint: latest?.signing_fingerprint ?? "Not provided",
    // 5.c.iv.zo -- read straight through from the Console's signed index,
    // same "this repo stays write-free" posture as the fields above; an
    // older cached index without a `rollout` block reads as fully
    // available, never as a hard zero (see RawVersion's own comment).
    rollout_percentage: latest?.rollout?.percentage ?? 100,
    rollout_status: latest?.rollout?.status ?? "complete",
    // `String(...)` -- App.release_id is a string everywhere (Aptoide's
    // own stand-in is `String(vercode)`); Zealot's release_id arrives as
    // a number over JSON. Missing entirely (no release attached yet, or
    // an index predating this field) falls to the app's own id, which is
    // still unique enough for bucketing purposes and never empty.
    release_id: latest?.release_id != null ? String(latest.release_id) : `zealot-${raw.id}`,
    play_store_rejection_reason: null,
    permissions: [],
    // Zealot publishes `listing.screenshots[]` (Task 27d-e1), already in display order. Only real https
    // URLs are kept (AppIcon/ScreenshotCarousel gate on the same check); an older cached index without
    // the key reads as no screenshots.
    screenshots: (raw.listing.screenshots ?? [])
      .map((shot) => shot?.url)
      .filter((url): url is string => typeof url === "string" && url.startsWith("https://")),
    changelog: latest?.changelog?.trim() || "No changelog provided.",
    // 5.c.v.zo -- the whole `versions[]` (newest first, never re-sorted) through
    // the pure reader; `latest` above is still `versions[0]`, untouched. An
    // index that was read but had no versions gives an empty list, not "not provided".
    version_history: history.entries,
    version_history_omitted: history.omitted,
    // 5.c.vii.zo -- the newest release's lifecycle status, read through the same
    // safe reader the history entries use; NOT `rollout_status` above.
    version_status: readVersionStatus(latest?.status),

    developer_slug: slugifyName(raw.publisher.name),
    developer_name: raw.publisher.name,
    developer_website: raw.publisher.profile_url,

    available_regions: raw.available_regions?.length ? raw.available_regions : [...ALL_REGIONS],

    content_rating: mapContentRating(raw.listing.content_rating),
    data_safety: dataSafety,
    contains_ads: raw.listing.contains_ads ?? false,
    has_in_app_purchases: raw.listing.has_in_app_purchases ?? false,

    origin: ZEALOT_ORIGIN,
    package_name: raw.package_name ?? undefined,

    // Task 45b -- the neutral `base_stats` Zealot publishes for an app that was distributed by hand
    // before it was listed; this store adds its own counters on top and shows one total (lib/carried-over-stats.ts).
    // Null/absent reads as "none carried over", same conservative posture as the fields above.
    base_stats: normalizeBaseStats(raw.base_stats),
    // Task 45d -- comments the app earned before it was listed, shown as ordinary reviews. Only rows with a
    // usable author, rating and date are kept, so a malformed entry cannot render as a broken review.
    carried_over_reviews: normalizeCarriedOverReviews(raw.reviews),

    not_provided: notProvided,
  };

  return app;
}

function normalizeBaseStats(raw: RawApp["base_stats"]): BaseStats | null {
  if (raw === null || raw === undefined) return null;
  const downloads = typeof raw.downloads === "number" && Number.isFinite(raw.downloads) ? raw.downloads : 0;
  const ratingRaw = raw.rating ?? null;
  const rating =
    ratingRaw !== null &&
    typeof ratingRaw.average === "number" &&
    Number.isFinite(ratingRaw.average) &&
    typeof ratingRaw.count === "number" &&
    Number.isFinite(ratingRaw.count) &&
    ratingRaw.count > 0
      ? { average: ratingRaw.average, count: ratingRaw.count }
      : null;
  if (downloads <= 0 && rating === null) return null;
  return { downloads: Math.floor(downloads), rating };
}

function normalizeCarriedOverReviews(raw: RawApp["reviews"]): CarriedOverReview[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => ({
      author_name: typeof entry?.author_name === "string" ? entry.author_name.trim() : "",
      rating: typeof entry?.rating === "number" && Number.isFinite(entry.rating) ? Math.floor(entry.rating) : 0,
      body: typeof entry?.body === "string" ? entry.body : null,
      commented_on: typeof entry?.commented_on === "string" ? entry.commented_on : "",
      helpful_count:
        typeof entry?.helpful_count === "number" && Number.isFinite(entry.helpful_count) && entry.helpful_count > 0
          ? Math.floor(entry.helpful_count)
          : 0,
    }))
    .filter((entry) => entry.author_name !== "" && entry.rating >= 1 && entry.rating <= 5 && entry.commented_on !== "");
}

// --- Fetch, verify, cache ---------------------------------------------

export async function readJsonFile<T>(parts: string[]): Promise<T | null> {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = path.join(process.cwd(), ...parts);
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(parts: string[], data: unknown): Promise<void> {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = path.join(process.cwd(), ...parts);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data), "utf-8");
  } catch {
    // best-effort cache -- a write failure here must never break the read path above it
  }
}

export { STATE_FILE, CACHE_FILE };

/**
 * Signature/schema/freshness/rollback checks only — no I/O beyond reading
 * the last anti-rollback state, and no cache write. Split out of the old
 * `fetchLiveIndex` (`5.g.i.zi`) as leaf `5.g.iv.zi`'s build-time snapshot
 * script needs a checkpoint *between* "this index's signature/sequence
 * check out" and "commit it as the new trusted cache" — that leaf verifies
 * every referenced file's real SHA-256 in between, and must NOT persist
 * `STATE_FILE`/`CACHE_FILE` if any of those checks fail, or a single bad
 * build would permanently roll the anti-rollback counter forward on data
 * this repo never actually finished trusting. Runtime's `fetchLiveIndex`
 * below has no such extra check, so it calls this and `commitIndexState`
 * back-to-back, same net behavior as before this split.
 *
 * Returns `null` on ANY failure (bad signature, wrong schema, expired,
 * rolled back) -- every rejection reason collapses to the same
 * "don't trust this" outcome, same posture the pre-split function used.
 */
export async function validateIndex(indexText: string, signatureText: string, tenantId: string = DEFAULT_TENANT_ID): Promise<RawIndex | null> {
  const matchedKey = await verifySignature(indexText, signatureText);
  if (!matchedKey) return null; // no pinned key matches -- never fall through to trusting the content anyway

  let parsed: RawIndex;
  try {
    parsed = JSON.parse(indexText) as RawIndex;
  } catch {
    return null;
  }

  if (parsed.schema_version !== SUPPORTED_SCHEMA_VERSION) return null;
  if (isExpired(parsed.expires_at)) return null;

  const lastState = await readJsonFile<IndexState>(stateFileFor(tenantId));
  if (isRollback({ sequence: parsed.sequence, generatedAt: parsed.generated_at }, lastState)) return null;

  return parsed;
}

/** Persists a fully-validated (and, for the build-time path, file-hash-verified) index as the new trusted cache. Never call this on a candidate that hasn't cleared every check — this is the point of no return that advances the anti-rollback counter. */
export async function commitIndexState(parsed: RawIndex, tenantId: string = DEFAULT_TENANT_ID): Promise<void> {
  await writeJsonFile(stateFileFor(tenantId), { sequence: parsed.sequence, generatedAt: parsed.generated_at } satisfies IndexState);
  await writeJsonFile(cacheFileFor(tenantId), parsed);
}

/** Fetches + fully verifies one candidate index over plain HTTP (the Pages CDN), then commits it immediately -- the runtime path, unchanged in behavior from before the `validateIndex`/`commitIndexState` split above. `scripts/snapshot-zealot-index.ts` (`5.g.iv.zi`) is the build-time path: same `validateIndex`, a per-file SHA-256 check in between, then the same `commitIndexState`. */
async function fetchLiveIndex(baseUrl: string, tenantId: string): Promise<RawIndex | null> {
  const base = baseUrl.replace(/\/+$/, "");

  let indexText: string;
  let signatureText: string;
  try {
    const [indexRes, sigRes] = await Promise.all([
      fetch(`${base}/index.json`, { cache: "no-store" }),
      fetch(`${base}/index.json.sig`, { cache: "no-store" }),
    ]);
    if (!indexRes.ok || !sigRes.ok) return null;
    indexText = await indexRes.text();
    signatureText = (await sigRes.text()).trim();
  } catch {
    return null; // network error -- caller falls back to cache
  }

  const parsed = await validateIndex(indexText, signatureText, tenantId);
  if (!parsed) return null;

  await commitIndexState(parsed, tenantId);
  return parsed;
}

/**
 * Resolves and caches a scope's trusted index for this server process's lifetime — same
 * "once per process, not once per caller" memoization `getMergedApps` (`lib/catalog.ts`)
 * applies one layer up, pulled down into this module so `createZealotSource().getApps()`
 * and `getZealotCollections()` (leaf `5.j.ii.zo`) share one resolution instead of each
 * independently fetching/reading the same index.
 *
 * `6.b.ii.zo`: one memo entry per scope (tenant + index URL) instead of one global. The
 * *promise* is memoized, so concurrent first requests for the same tenant share one fetch;
 * a null result is memoized like before (no retry until the process restarts — unchanged
 * behavior, deliberately not altered by this leaf). A rejected resolution is dropped so a
 * transient throw isn't cached forever.
 */
/**
 * The index is re-read at most once per `ZEALOT_INDEX_TTL_MS` (default 5 minutes; the env var
 * `ZEALOT_INDEX_TTL_MS` overrides it) so an app a developer publishes shows up on its own, with no
 * rebuild. Until then the memoized promise is shared, so concurrent requests still share one fetch.
 * A refresh that cannot reach the live index keeps the last index this process already verified
 * (never the older build-time disk copy over a fresher one); a first load that found nothing is
 * retried after the same interval instead of staying empty until the process restarts.
 */
const parsedTtl = Number(process.env.ZEALOT_INDEX_TTL_MS);
export const ZEALOT_INDEX_TTL_MS = Number.isFinite(parsedTtl) && parsedTtl > 0 ? parsedTtl : 5 * 60 * 1000;

const indexMemo = new Map<string, { at: number; promise: Promise<RawIndex | null> }>();

async function loadIndex(scope: CatalogScope): Promise<RawIndex | null> {
  let index: RawIndex | null = null;

  if (scope.baseUrl) {
    index = await fetchLiveIndex(scope.baseUrl, scope.tenantId);
  }
  // Only the default tenant may read its disk cache without a configured URL (that's how the
  // build-time snapshot reaches a runtime with no env var). A non-default tenant with no URL
  // has no Zealot source at all — serving a leftover cache would resurrect a catalog the
  // operator removed.
  if (!index && (scope.baseUrl || scope.tenantId === DEFAULT_TENANT_ID)) {
    index = await readJsonFile<RawIndex>(cacheFileFor(scope.tenantId));
  }
  return index;
}

async function refreshIndex(scope: CatalogScope, previous: RawIndex | null): Promise<RawIndex | null> {
  if (previous && scope.baseUrl) {
    const live = await fetchLiveIndex(scope.baseUrl, scope.tenantId);
    return live ?? previous;
  }
  return loadIndex(scope);
}

function resolveIndex(scope: CatalogScope): Promise<RawIndex | null> {
  const key = catalogScopeKey(scope);
  const now = Date.now();
  const entry = indexMemo.get(key);
  if (entry && now - entry.at < ZEALOT_INDEX_TTL_MS) return entry.promise;
  const promise = (async () => {
    const previous = entry ? await entry.promise.catch(() => null) : null;
    return refreshIndex(scope, previous);
  })();
  const fresh = { at: now, promise };
  indexMemo.set(key, fresh);
  promise.catch(() => {
    if (indexMemo.get(key) === fresh) indexMemo.delete(key);
  });
  return promise;
}

/** Test seam: drops every memoized scope. */
export function resetZealotIndexMemo(): void {
  indexMemo.clear();
}

/**
 * `CatalogSource` for Zealot's first-party index. Snapshot-cached in
 * memory per server lifetime like every other source
 * (`getMergedApps` in `lib/catalog.ts` already caches the merged result,
 * so this only actually runs once per server process regardless).
 *
 * ❓ open, flagged rather than silently decided: if there's no configured
 * URL, a failed fetch, or a rejected (unsigned / rolled-back / expired /
 * wrong-schema) response, this falls back to the last index this reader
 * itself already verified and cached to disk. An attacker-frozen OLD
 * cached index is exactly what a freshness check exists to catch — but
 * showing nothing at all during a transient Pages outage is arguably a
 * worse failure for a live storefront than briefly serving a stale-but-
 * once-verified catalog. This reader takes the "serve stale" side of that
 * tradeoff; revisit once there's a real outage to learn from.
 */
export function createZealotSource(scope: CatalogScope): CatalogSource {
  return {
    origin: ZEALOT_ORIGIN,
    async getApps(): Promise<App[]> {
      const index = await resolveIndex(scope);
      if (!index) return []; // never fetched successfully, ever -- same "empty is a valid state" precedent lib/sources/aptoide.ts set for a missing snapshot
      return index.apps.map(normalizeZealotApp);
    },
  };
}

/**
 * The collection registry off the same signed index — leaf `5.j.ii.zo`.
 * Read-only, straight through: `RawCollection`'s shape already matches
 * `Collection` (`lib/mock-data.ts`) field-for-field, so no per-field
 * mapping is needed the way `normalizeZealotApp` needs for `App`.
 * `[]` when the index has no registry yet (older cache) or hasn't ever
 * resolved — `lib/catalog.ts`'s `getCollections()` treats an empty
 * registry as a valid, unremarkable state, same as an empty catalog.
 */
export async function getZealotCollections(scope: CatalogScope): Promise<Collection[]> {
  const index = await resolveIndex(scope);
  return index?.collections ?? [];
}
