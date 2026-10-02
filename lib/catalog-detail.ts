/**
 * Single-row reads of the `catalog_app` table — leaf `5.l.vi.zi` (app pages by lookup).
 *
 * SERVER-ONLY. The detail page, the report and counter routes and the favourites list ask about ONE
 * app by slug. Before this leaf each of those loaded the whole merged catalog (every row, 100 a
 * page) and searched it in memory. Here a request reads exactly one row over Supabase's PostgREST
 * `/rest/v1/catalog_app` with the **service-role** key (the same key and the same
 * `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` rules as `lib/catalog-table.ts`, read at call time).
 *
 * NO MIGRATION. This is a plain filtered select on the table the first migration made, not a new SQL
 * function, so it works as soon as `catalog_app` exists. The slug has a unique index and so has the
 * developer slug (`catalog_app_developer_idx`), so each read is one index lookup.
 *
 * Three reads:
 * - `readCatalogApp(slug)`: the row's flat columns AND its `raw` payload, turned into a full `App`
 *   (long description, screenshots, permissions, changelog, rating, content rating, minimum Android
 *   version, version history, scan rank) by the same `normalizeAptoideApp` the ingest uses. The flat
 *   columns win where they overlap (`id`, `slug`, `package_name`, `category`, `app_type` and the two
 *   dates), because those are what every list, shelf and chart shows; the re-derive of leaf
 *   `5.l.viii.zo` updates the columns, and the page must agree with the shelf the visitor came from.
 *   A row whose `raw` cannot be normalised is shown as the list-grade app (`appFromCatalogRow`),
 *   never as an error: a page with less on it is better than no page.
 * - `readCatalogDeveloper(slug)`: one developer's name and website, from the first row (by slug) of
 *   that developer. The website is read out of `raw` by PostgREST (`raw->developer->>website`), so
 *   `raw` itself is not transferred.
 * - `readCatalogSlugExists(slug)`: is there a published row with this slug, and what is its package
 *   name. No `raw`, a few bytes.
 *
 * Contract (same as `lib/catalog-table.ts`):
 * - Never throws. Every outcome is a result value.
 * - `not_configured`: the env vars are unset or unusable. No request is made.
 * - `unavailable`: the request failed or the answer was not what is relied on (non-2xx, network
 *   error, timeout, redirect, oversized body, not an array, more than one row, a malformed row). One
 *   reason on purpose. The caller falls back to the whole-catalog path; it must NOT read this as
 *   "no such app".
 * - "No such app" is `{ ok: true, app: null }` (or `developer: null`, `found: null`). A slug that
 *   cannot be in the table (it fails the table's own `catalog_app_slug_format` pattern, or is over
 *   200 characters) is answered the same way without a request.
 * - Published rows only (`is_published=eq.true`), so a take-down hides an app on its own page too.
 * - Nothing here logs a slug, a body or an error message; the only log lines are fixed labels plus an
 *   HTTP status. Requests use `redirect: "error"` so the key is never forwarded.
 * - Size: the body is capped at `CATALOG_MAX_BODY_BYTES` (1 MB), the same ceiling the list answer has.
 *   One stored Aptoide response with its version history is far below it.
 */

import {
  CATALOG_MAX_BODY_BYTES,
  CATALOG_SLUG_PATTERN,
  CATALOG_TABLE_TIMEOUT_MS,
  parseCatalogRow,
  readCatalogTableConfig,
  type CatalogRow,
  type CatalogTableDeps,
} from "./catalog-table";
import { appFromCatalogRow } from "./sources/catalog-table";
import { normalizeAptoideApp, type AptoideRawApp } from "./sources/aptoide";
import type { App } from "./mock-data";

type Failure = { ok: false; reason: "not_configured" | "unavailable" };

export type CatalogAppLookup = { ok: true; app: App | null } | Failure;

export interface CatalogDeveloper {
  slug: string;
  name: string;
  /** Only an `http(s)` URL; anything else is `null`, because the profile page renders it as a link. */
  website: string | null;
}
export type CatalogDeveloperLookup = { ok: true; developer: CatalogDeveloper | null } | Failure;

export type CatalogSlugLookup = { ok: true; found: { package_name: string } | null } | Failure;

/** Longest slug the table can hold; the same ceiling `lib/catalog-table.ts` puts on a cursor's slug. */
const MAX_SLUG_LENGTH = 200;
/** A developer slug is not pattern-checked by the table (only non-blank), so only its length is bounded. */
const MAX_DEVELOPER_SLUG_LENGTH = 200;

const ROW_COLUMNS =
  "id,slug,package_name,origin,name,summary,icon,version,app_type,category," +
  "developer_slug,developer_name,license,size_mb,download_url,reported_downloads," +
  "source_created_at,source_updated_at";

function slugCanExist(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length <= MAX_SLUG_LENGTH && CATALOG_SLUG_PATTERN.test(slug);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Fetched = { ok: true; rows: unknown[] } | Failure;

/** One GET against the table. `query` is a ready-made, already-encoded query string. */
async function selectRows(query: string, label: string, deps: CatalogTableDeps): Promise<Fetched> {
  const cfg = readCatalogTableConfig(deps.env ?? process.env);
  if (!cfg) return { ok: false, reason: "not_configured" };

  const doFetch = deps.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? CATALOG_TABLE_TIMEOUT_MS);
  try {
    const res = await doFetch(`${cfg.baseUrl}/rest/v1/catalog_app?${query}`, {
      method: "GET",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        Accept: "application/json",
      },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status < 200 || res.status >= 300) {
      console.error(`catalog-detail: ${label} failed, status ${res.status}`);
      return { ok: false, reason: "unavailable" };
    }
    const text = await res.text();
    if (text.length > CATALOG_MAX_BODY_BYTES) {
      console.error(`catalog-detail: ${label} answer too large`);
      return { ok: false, reason: "unavailable" };
    }
    const body: unknown = JSON.parse(text);
    // Every read asks for `limit=1`; more than one row means the table is not what this module relies on.
    if (!Array.isArray(body) || body.length > 1) {
      console.error(`catalog-detail: ${label} answer was not one row`);
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, rows: body };
  } catch {
    // Network error, timeout (abort), refused redirect or unparsable JSON. The error object is not
    // logged: its message can contain the request URL.
    console.error(`catalog-detail: ${label} failed, no response`);
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The row's list-grade `App` upgraded with everything `raw` holds, or just the list-grade app when
 * `raw` is missing or cannot be normalised. Never throws.
 */
export function appFromCatalogDetail(row: CatalogRow, raw: unknown): App {
  const listGrade = appFromCatalogRow(row);
  if (!isPlainObject(raw)) return listGrade;

  let full: App;
  try {
    full = normalizeAptoideApp(raw as unknown as AptoideRawApp);
  } catch {
    console.error("catalog-detail: stored payload not readable, showing the list-grade page");
    return listGrade;
  }

  const merged: App = {
    ...full,
    // The columns win where they overlap: they are what the lists show (see the header comment).
    id: row.id,
    slug: row.slug,
    package_name: row.package_name,
    category: row.category,
    app_type: row.app_type,
    created_at: row.source_created_at,
    updated_at: row.source_updated_at,
  };
  // `category_raw` explains why the payload's own placement fell back to `uncategorized`; it says
  // nothing about a category the columns have since moved to.
  if (full.category !== row.category) delete merged.category_raw;
  return merged;
}

/** One published app by slug, as a full `App`. `app: null` = no such published row. */
export async function readCatalogApp(slug: string, deps: CatalogTableDeps = {}): Promise<CatalogAppLookup> {
  if (!slugCanExist(slug)) return { ok: true, app: null };

  const got = await selectRows(
    `slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&select=${ROW_COLUMNS},raw&limit=1`,
    "read app",
    deps,
  );
  if (!got.ok) return got;
  if (got.rows.length === 0) return { ok: true, app: null };

  const item = got.rows[0];
  const row = parseCatalogRow(item);
  // The slug asked for must be the slug answered; anything else is not this module's contract.
  if (row === null || row.slug !== slug) {
    console.error("catalog-detail: read app returned a malformed row");
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, app: appFromCatalogDetail(row, (item as Record<string, unknown>).raw) };
}

/** Is there a published row with this slug? Returns its package name so the caller can apply the first-party rule. */
export async function readCatalogSlugExists(slug: string, deps: CatalogTableDeps = {}): Promise<CatalogSlugLookup> {
  if (!slugCanExist(slug)) return { ok: true, found: null };

  const got = await selectRows(
    `slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&select=slug,package_name&limit=1`,
    "check slug",
    deps,
  );
  if (!got.ok) return got;
  if (got.rows.length === 0) return { ok: true, found: null };

  const item = got.rows[0];
  if (!isPlainObject(item) || item.slug !== slug || typeof item.package_name !== "string" || item.package_name === "") {
    console.error("catalog-detail: check slug returned a malformed row");
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, found: { package_name: item.package_name } };
}

/** One developer's name and website, from that developer's first published row by slug. */
export async function readCatalogDeveloper(slug: string, deps: CatalogTableDeps = {}): Promise<CatalogDeveloperLookup> {
  if (typeof slug !== "string" || slug === "" || slug.length > MAX_DEVELOPER_SLUG_LENGTH) {
    return { ok: true, developer: null };
  }

  const got = await selectRows(
    `developer_slug=eq.${encodeURIComponent(slug)}&is_published=eq.true` +
      `&select=developer_slug,developer_name,website:raw->developer->>website&order=slug.asc&limit=1`,
    "read developer",
    deps,
  );
  if (!got.ok) return got;
  if (got.rows.length === 0) return { ok: true, developer: null };

  const item = got.rows[0];
  if (
    !isPlainObject(item) ||
    item.developer_slug !== slug ||
    typeof item.developer_name !== "string" ||
    item.developer_name.trim() === "" ||
    !(item.website === null || item.website === undefined || typeof item.website === "string")
  ) {
    console.error("catalog-detail: read developer returned a malformed row");
    return { ok: false, reason: "unavailable" };
  }
  const website = typeof item.website === "string" && /^https?:\/\//i.test(item.website) ? item.website : null;
  return { ok: true, developer: { slug, name: item.developer_name, website } };
}
