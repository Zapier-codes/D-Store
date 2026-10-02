/**
 * The few `catalog_app` columns the push dispatch needs, for a list of slugs — leaf `5.l.xv.zo`.
 *
 * SERVER-ONLY. The dispatch plan (`buildPlan`, `lib/push-plan.ts`) only ever looks at apps somebody
 * is subscribed to, yet `getDispatchCatalog` used to load every app to hand it that list. Here the
 * dispatcher asks for exactly the subscribed slugs: PostgREST selects on `catalog_app` filtered by
 * `slug=in.(...)`, in chunks of `DISPATCH_CHUNK` slugs, published rows only, service-role key,
 * `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` read at call time as every other table reader here does.
 * Only `slug`, `package_name`, `name` and `version` are selected; no `raw`, no description.
 *
 * NO MIGRATION. A plain filtered select on the table the first migration made (the slug has a unique
 * index), like `lib/catalog-detail.ts`.
 *
 * `package_name` is returned so the caller can drop a row that belongs to a first-party app, which the
 * merged catalog does not contain (`mergeCatalogSources`).
 *
 * Contract (same shape as `lib/catalog-developer-apps.ts`):
 * - Never throws. `not_configured` makes no request.
 * - `unavailable` is one reason for everything else: more than `DISPATCH_SLUGS_MAX` distinct slugs, a
 *   non-2xx, a network error, a timeout, a redirect, an oversized body, an answer that is not an array,
 *   more rows than slugs asked for, a malformed row, a row whose slug was not asked for, or the same
 *   slug twice. Never a partial answer: one bad chunk refuses the whole read, because a missing app
 *   would look like "not in the catalog" and its subscribers would be silently skipped.
 * - A slug with no published row is simply absent from `rows`. That is a true answer, not a failure.
 * - A blank or non-string slug, or one that cannot be in the table (`CATALOG_SLUG_PATTERN`, over 200
 *   characters), is left out of the request and is absent from `rows`, as the whole-catalog path would
 *   find nothing for it either.
 * - Nothing is logged but fixed labels plus an HTTP status. `redirect: "error"`.
 */

import {
  CATALOG_MAX_BODY_BYTES,
  CATALOG_SLUG_PATTERN,
  CATALOG_TABLE_TIMEOUT_MS,
  readCatalogTableConfig,
  type CatalogTableDeps,
} from "./catalog-table";

/** Slugs per request; 50 slugs of at most 200 characters keep the URL near 10 KB, as `push-store.ts` batches. */
export const DISPATCH_CHUNK = 50;
/** Most distinct slugs one call will read (20 requests); more is refused and the caller falls back. */
export const DISPATCH_SLUGS_MAX = 1000;
const MAX_SLUG_LENGTH = 200;

export interface DispatchRow {
  slug: string;
  package_name: string;
  name: string;
  version: string;
}

export type CatalogDispatchResult =
  | { ok: true; rows: DispatchRow[] }
  | { ok: false; reason: "not_configured" | "unavailable" };

/** One PostgREST `in.(...)` list: each value quoted, `\` and `"` escaped, the whole thing URL-encoded. Exported for tests. */
export function buildDispatchQuery(slugs: readonly string[]): string | null {
  if (!Array.isArray(slugs) || slugs.length === 0 || slugs.length > DISPATCH_CHUNK) return null;
  for (const slug of slugs) if (typeof slug !== "string" || slug === "") return null;
  const quoted = slugs.map((slug) => `"${slug.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",");
  return `select=slug,package_name,name,version&is_published=eq.true&slug=${encodeURIComponent(`in.(${quoted})`)}&limit=${slugs.length}`;
}

function parseRow(value: unknown): DispatchRow | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const { slug, package_name, name, version } = value as Record<string, unknown>;
  if (typeof slug !== "string" || typeof package_name !== "string" || typeof name !== "string" || typeof version !== "string") return null;
  return { slug, package_name, name, version };
}

export async function readCatalogDispatchApps(slugs: Iterable<string>, deps: CatalogTableDeps = {}): Promise<CatalogDispatchResult> {
  const cfg = readCatalogTableConfig(deps.env ?? process.env);
  if (!cfg) return { ok: false, reason: "not_configured" };

  const wanted = new Set<string>();
  try {
    for (const slug of slugs) {
      if (typeof slug === "string" && slug !== "" && slug.length <= MAX_SLUG_LENGTH && CATALOG_SLUG_PATTERN.test(slug)) wanted.add(slug);
    }
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (wanted.size > DISPATCH_SLUGS_MAX) return { ok: false, reason: "unavailable" };
  if (wanted.size === 0) return { ok: true, rows: [] };

  const list = [...wanted];
  const doFetch = deps.fetch ?? fetch;
  const rows: DispatchRow[] = [];
  const got = new Set<string>();

  for (let i = 0; i < list.length; i += DISPATCH_CHUNK) {
    const chunk = list.slice(i, i + DISPATCH_CHUNK);
    const query = buildDispatchQuery(chunk);
    if (query === null) return { ok: false, reason: "unavailable" };
    const asked = new Set(chunk);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? CATALOG_TABLE_TIMEOUT_MS);
    try {
      const res = await doFetch(`${cfg.baseUrl}/rest/v1/catalog_app?${query}`, {
        method: "GET",
        headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, Accept: "application/json" },
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
      });
      if (res.status < 200 || res.status >= 300) {
        console.error(`catalog-dispatch: failed, status ${res.status}`);
        return { ok: false, reason: "unavailable" };
      }
      const text = await res.text();
      if (text.length > CATALOG_MAX_BODY_BYTES) {
        console.error("catalog-dispatch: answer too large");
        return { ok: false, reason: "unavailable" };
      }
      const body: unknown = JSON.parse(text);
      if (!Array.isArray(body) || body.length > chunk.length) {
        console.error("catalog-dispatch: answer was not what was asked for");
        return { ok: false, reason: "unavailable" };
      }
      for (const item of body) {
        const row = parseRow(item);
        if (row === null || !asked.has(row.slug) || got.has(row.slug)) {
          console.error("catalog-dispatch: answer held a bad row");
          return { ok: false, reason: "unavailable" };
        }
        got.add(row.slug);
        rows.push(row);
      }
    } catch {
      // Network error, timeout (abort), refused redirect or unparsable JSON; not logged, the message can hold the URL.
      console.error("catalog-dispatch: failed, no response");
      return { ok: false, reason: "unavailable" };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: true, rows };
}
