/**
 * Loader for the `catalog_app` table — leaf `5.l.ii.zo`.
 *
 * Turns raw Aptoide snapshot entries (`AptoideRawApp`) into `catalog_app` rows and
 * writes them to Supabase in batches. Pure row-building plus one HTTP writer; the
 * file reading is `scripts/load-catalog-table.ts`. SERVER/SCRIPT USE ONLY: it uses
 * the service-role key. `5.l.iii.zi` (the ingest job) reuses `buildCatalogRows` and
 * `writeCatalogRows` so the loader and the ingest cannot disagree on a row.
 *
 * Rules taken from the table's header (`20261002000000_create_catalog_app.sql`):
 * - Flat columns come from `normalizeAptoideApp`, the same function the detail page
 *   uses, so a row cannot disagree with the page. `raw` is stored as fetched.
 * - Times are sent as explicit UTC ISO strings. Aptoide's `YYYY-MM-DD HH:MM:SS` has
 *   no zone and is treated as UTC (as the normalizer already does).
 * - One row that breaks a check fails its whole statement, so every row is checked
 *   here against the same rules first and what is skipped is COUNTED, with a reason.
 * - `slug` and `package_name` are unique. Duplicates inside one load keep the first
 *   (the same "first one wins" as `mergeCatalogSources`) and count the rest.
 * - The write is an upsert on `id` (`merge-duplicates`), so a re-run refreshes the
 *   derived columns from `raw` (the table's stated cure for a normalizer change) and
 *   leaves `ingested_at` alone. A batch refused for a slug/package conflict with a
 *   row already stored under another id is retried row by row, so one conflict skips
 *   one row, not 100.
 * - Never logs a row, a body or the key; only counts and HTTP statuses. `redirect:
 *   "error"` so the key is never forwarded.
 */

import { normalizeAptoideApp, type AptoideRawApp } from "./sources/aptoide";

export const LOAD_BATCH_SIZE = 100;
export const LOAD_TIMEOUT_MS = 30_000;

const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The columns written; `ingested_at` is left to its default. */
export interface CatalogInsertRow {
  id: string;
  slug: string;
  package_name: string;
  origin: "aptoide";
  name: string;
  summary: string;
  icon: string;
  version: string;
  app_type: "app" | "game";
  category: string;
  developer_slug: string;
  developer_name: string;
  license: string;
  size_mb: number;
  download_url: string;
  reported_downloads: number | null;
  is_published: boolean;
  source_created_at: string;
  source_updated_at: string;
  raw: unknown;
}

export type SkipReason =
  | "not_normalizable"
  | "bad_row"
  | "bad_slug"
  | "bad_time"
  | "duplicate_id"
  | "duplicate_slug"
  | "duplicate_package";

export interface BuildResult {
  rows: CatalogInsertRow[];
  skipped: Record<SkipReason, number>;
}

function emptySkips(): Record<SkipReason, number> {
  return {
    not_normalizable: 0,
    bad_row: 0,
    bad_slug: 0,
    bad_time: 0,
    duplicate_id: 0,
    duplicate_slug: 0,
    duplicate_package: 0,
  };
}

/** `YYYY-MM-DD HH:MM:SS` (no zone, read as UTC) or any ISO string with a zone, to a UTC ISO string; `null` if unusable. */
export function toUtcIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const bare = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d{1,6})?$/.exec(text);
  const parsed = bare ? Date.parse(`${bare[1]}T${bare[2]}${bare[3] ?? ""}Z`) : /(Z|[+-]\d{2}(:?\d{2})?)$/.test(text) ? Date.parse(text) : NaN;
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

const nonBlank = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Builds the validated, de-duplicated rows for a list of raw snapshot entries. Never throws. */
export function buildCatalogRows(rawApps: readonly unknown[]): BuildResult {
  const skipped = emptySkips();
  const rows: CatalogInsertRow[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const packages = new Set<string>();

  for (const entry of rawApps) {
    let app;
    try {
      app = normalizeAptoideApp(entry as AptoideRawApp);
    } catch {
      skipped.not_normalizable += 1;
      continue;
    }

    const created = toUtcIso(app.created_at);
    const updated = toUtcIso(app.updated_at);
    if (created === null || updated === null) {
      skipped.bad_time += 1;
      continue;
    }
    if (typeof app.slug !== "string" || !SLUG_PATTERN.test(app.slug)) {
      skipped.bad_slug += 1;
      continue;
    }

    const downloads = app.third_party_stats?.downloads ?? null;
    const packageName = app.package_name ?? "";
    const valid =
      nonBlank(app.id) &&
      nonBlank(packageName) &&
      nonBlank(app.name) &&
      nonBlank(app.version) &&
      nonBlank(app.category) &&
      nonBlank(app.developer_slug) &&
      nonBlank(app.developer_name) &&
      (app.app_type === "app" || app.app_type === "game") &&
      Number.isFinite(app.size_mb) &&
      app.size_mb >= 0 &&
      app.size_mb < 1e7 &&
      (app.apk === "" || app.apk.startsWith("https://")) &&
      (downloads === null || (Number.isSafeInteger(downloads) && downloads >= 0)) &&
      typeof entry === "object" &&
      entry !== null &&
      !Array.isArray(entry);
    if (!valid) {
      skipped.bad_row += 1;
      continue;
    }

    if (ids.has(app.id)) {
      skipped.duplicate_id += 1;
      continue;
    }
    if (slugs.has(app.slug)) {
      skipped.duplicate_slug += 1;
      continue;
    }
    if (packages.has(packageName)) {
      skipped.duplicate_package += 1;
      continue;
    }
    ids.add(app.id);
    slugs.add(app.slug);
    packages.add(packageName);

    rows.push({
      id: app.id,
      slug: app.slug,
      package_name: packageName,
      origin: "aptoide",
      name: app.name,
      summary: app.summary ?? "",
      icon: app.icon ?? "",
      version: app.version,
      app_type: app.app_type,
      category: app.category,
      developer_slug: app.developer_slug,
      developer_name: app.developer_name ?? "Unknown developer",
      license: app.license || "Not provided",
      size_mb: app.size_mb,
      download_url: app.apk,
      reported_downloads: downloads,
      is_published: true,
      source_created_at: created,
      source_updated_at: updated,
      raw: entry,
    });
  }

  return { rows, skipped };
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

export interface WriteDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  batchSize?: number;
  /** Called after each batch with a fixed-shape progress record (counts only). */
  onProgress?: (progress: { written: number; total: number }) => void;
}

export interface WriteReport {
  written: number;
  /** Rows refused one by one after a batch conflict (a slug or package already stored under another id). */
  conflicts: number;
}

export type WriteResult =
  | { ok: true; report: WriteReport }
  | { ok: false; reason: "not_configured" | "unavailable"; report: WriteReport };

function readConfig(env: Record<string, string | undefined>): { baseUrl: string; key: string } | null {
  const rawUrl = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rawUrl || !key) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
  if (url.username || url.password) return null;
  return { baseUrl: url.origin, key };
}

type PostOutcome = "ok" | "conflict" | "failed";

async function post(
  cfg: { baseUrl: string; key: string },
  rows: CatalogInsertRow[],
  doFetch: typeof fetch,
  timeoutMs: number,
): Promise<PostOutcome> {
  try {
    const res = await doFetch(`${cfg.baseUrl}/rest/v1/catalog_app?on_conflict=id`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return "ok";
    // 409 = a unique or check constraint refused the statement; the body is never read or logged.
    console.error(`catalog-load: write refused with HTTP ${res.status}`);
    return res.status === 409 ? "conflict" : "failed";
  } catch {
    console.error("catalog-load: write request failed");
    return "failed";
  }
}

/** Upserts `rows` in batches. Stops at the first batch that fails for any reason other than a conflict. */
export async function writeCatalogRows(rows: readonly CatalogInsertRow[], deps: WriteDeps = {}): Promise<WriteResult> {
  const report: WriteReport = { written: 0, conflicts: 0 };
  const cfg = readConfig(deps.env ?? process.env);
  if (!cfg) return { ok: false, reason: "not_configured", report };

  const doFetch = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? LOAD_TIMEOUT_MS;
  const size = Math.max(1, Math.min(deps.batchSize ?? LOAD_BATCH_SIZE, 500));

  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    const outcome = await post(cfg, batch, doFetch, timeoutMs);
    if (outcome === "ok") {
      report.written += batch.length;
    } else if (outcome === "conflict") {
      // Find the row(s) at fault: one request each, so one conflict skips one row.
      for (const row of batch) {
        const single = await post(cfg, [row], doFetch, timeoutMs);
        if (single === "ok") report.written += 1;
        else if (single === "conflict") report.conflicts += 1;
        else return { ok: false, reason: "unavailable", report };
      }
    } else {
      return { ok: false, reason: "unavailable", report };
    }
    deps.onProgress?.({ written: report.written, total: rows.length });
  }
  return { ok: true, report };
}
