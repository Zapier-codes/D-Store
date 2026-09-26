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
 */

import type { App, AppOrigin, ContentRating, DataSafetyInfo, NotProvidedField } from "../mock-data";
import { ALL_REGIONS } from "../mock-data";
import type { CatalogSource } from "./types";
import { verifySignature, isRollback, isExpired, SUPPORTED_SCHEMA_VERSION, type IndexState } from "./zealot-trust";

const ZEALOT_ORIGIN: AppOrigin = "zealot";
const STATE_FILE = ["storage", "downloads", "zealot-index-state.json"];
const CACHE_FILE = ["storage", "downloads", "zealot-index-cache.json"];

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
  version_name: string | null;
  download_url: string | null;
  sha256: string | null;
  size_bytes: number | null;
  signing_fingerprint: string | null;
  changelog: string | null;
  compatibility: { min_sdk: number | null };
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
}

export interface RawIndex {
  schema_version: number;
  generated_at: string;
  sequence: number;
  expires_at: string;
  apps: RawApp[];
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

/** Same fallback `lib/sources/aptoide.ts`'s `categoryForPackage` uses for an app it can't place — v2's `category` field is reserved/null for every app today (confirmed by reading `app/services/catalog_index/serializer.rb`), so every Zealot-origin entry hits this fallback until Task 30 populates the real field. */
const CATEGORY_FALLBACK = "internet";

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
    category: raw.category ?? CATEGORY_FALLBACK,
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
    developer_verified: raw.publisher.verified ?? false, // 5.g.iii.zi -- the Console's own developer/agreement-status flag, read straight through; unset is "not verified", not an error
    min_android_version: latest?.compatibility?.min_sdk ? `API ${latest.compatibility.min_sdk}` : "Not provided",
    size_mb: latest?.size_bytes ? Math.round((latest.size_bytes / (1024 * 1024)) * 10) / 10 : 0,
    sha256_checksum: latest?.sha256 ?? "Not provided",
    signing_certificate_fingerprint: latest?.signing_fingerprint ?? "Not provided",
    play_store_rejection_reason: null,
    permissions: [],
    screenshots: [], // reserved on Zealot's side (Task 27d) -- always empty today, not guessed
    changelog: latest?.changelog?.trim() || "No changelog provided.",

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

    not_provided: notProvided,
  };

  return app;
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
export async function validateIndex(indexText: string, signatureText: string): Promise<RawIndex | null> {
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

  const lastState = await readJsonFile<IndexState>(STATE_FILE);
  if (isRollback({ sequence: parsed.sequence, generatedAt: parsed.generated_at }, lastState)) return null;

  return parsed;
}

/** Persists a fully-validated (and, for the build-time path, file-hash-verified) index as the new trusted cache. Never call this on a candidate that hasn't cleared every check — this is the point of no return that advances the anti-rollback counter. */
export async function commitIndexState(parsed: RawIndex): Promise<void> {
  await writeJsonFile(STATE_FILE, { sequence: parsed.sequence, generatedAt: parsed.generated_at } satisfies IndexState);
  await writeJsonFile(CACHE_FILE, parsed);
}

/** Fetches + fully verifies one candidate index over plain HTTP (the Pages CDN), then commits it immediately -- the runtime path, unchanged in behavior from before the `validateIndex`/`commitIndexState` split above. `scripts/snapshot-zealot-index.ts` (`5.g.iv.zi`) is the build-time path: same `validateIndex`, a per-file SHA-256 check in between, then the same `commitIndexState`. */
async function fetchLiveIndex(baseUrl: string): Promise<RawIndex | null> {
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

  const parsed = await validateIndex(indexText, signatureText);
  if (!parsed) return null;

  await commitIndexState(parsed);
  return parsed;
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
export function createZealotSource(): CatalogSource {
  return {
    origin: ZEALOT_ORIGIN,
    async getApps(): Promise<App[]> {
      const baseUrl = process.env.ZEALOT_CATALOG_INDEX_BASE_URL?.trim();
      let index: RawIndex | null = null;

      if (baseUrl) {
        index = await fetchLiveIndex(baseUrl);
      }

      if (!index) {
        index = await readJsonFile<RawIndex>(CACHE_FILE);
      }

      if (!index) return []; // never fetched successfully, ever -- same "empty is a valid state" precedent lib/sources/aptoide.ts set for a missing snapshot
      return index.apps.map(normalizeZealotApp);
    },
  };
}
