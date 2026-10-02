/**
 * Re-derive `category` and `app_type` in `catalog_app` from each row's stored `raw` — leaf `5.l.viii.zo`.
 *
 * Why: 1,494 of the 1,506 rows loaded before `5.l.viii` are `uncategorized`, because the loader ran
 * before the normalizer knew about `media.keywords`. The table keeps `raw` exactly as Aptoide sent it, so the
 * two derived columns can be recomputed with no network call to Aptoide, which is the table's own stated cure
 * for a normalizer change (`20261002000000_create_catalog_app.sql`).
 *
 * How: read the rows in id order, a page at a time (`id`, `app_type`, `category`, `raw`), decide each row's
 * placement with `placeAptoideApp` (the same function `normalizeAptoideApp` uses, so a re-derived row and a
 * freshly ingested one cannot disagree), keep only the rows whose answer differs from what is stored, then
 * PATCH the two columns, one request per distinct `{ app_type, category }` per 100 ids. No other column is
 * touched: `source_updated_at` and `ingested_at` stay as they are, so the "New & Updated" order does not move.
 *
 * SERVER/SCRIPT USE ONLY: it uses the service-role key. Never logs a row, a body or the key; counts only.
 * `redirect: "error"` so the key is never forwarded. Only rows with `origin = 'aptoide'` are read or written,
 * because the placement function is Aptoide's.
 *
 * Race, accepted: the read and the write are separate steps. A crawl that upserts the same row in between has
 * already stored the category the same function derives from the same `raw`, so the PATCH writes the same value.
 */

import { readConfig } from "./catalog-load";
import { placeAptoideApp, type AptoideRawApp } from "./sources/aptoide";

export const REDERIVE_PAGE_SIZE = 100;
export const REDERIVE_PATCH_BATCH = 100;
export const REDERIVE_TIMEOUT_MS = 60_000;

/** The ids this module will put in a URL. Anything else is counted as unreadable, never sent. */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface StoredRow {
  id: string;
  app_type: string;
  category: string;
  raw: unknown;
}

export interface PlannedChange {
  id: string;
  app_type: "app" | "game";
  category: string;
}

/** `app/<slug>` or `game/<slug>`: a category slug is only unambiguous with its `app_type`. */
export type ShelfKey = string;

export interface RederivePlan {
  changes: PlannedChange[];
  unchanged: number;
  /** A row with an id that is unsafe to send, or a `raw` that could not be placed. Left as stored. */
  unreadable: number;
  /** Rows by shelf as stored. */
  before: Record<ShelfKey, number>;
  /** Rows by shelf as they will be after the changes (an unreadable row stays where it is stored). */
  after: Record<ShelfKey, number>;
  /** Of the changed rows, how many were placed by `media.keywords`. */
  changedByKeywords: number;
}

const bump = (counts: Record<ShelfKey, number>, key: ShelfKey): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

export const shelfKey = (appType: string, category: string): ShelfKey => `${appType}/${category}`;

/** Decides what each stored row should say. Pure; never throws, whatever the rows hold. */
export function planRederive(rows: readonly StoredRow[]): RederivePlan {
  const plan: RederivePlan = { changes: [], unchanged: 0, unreadable: 0, before: {}, after: {}, changedByKeywords: 0 };
  for (const row of rows) {
    const stored = shelfKey(String(row?.app_type), String(row?.category));
    bump(plan.before, stored);

    let placement: ReturnType<typeof placeAptoideApp> | null;
    try {
      placement = typeof row?.id === "string" && SAFE_ID.test(row.id) ? placeAptoideApp(row.raw as AptoideRawApp) : null;
    } catch {
      placement = null;
    }
    if (placement === null) {
      plan.unreadable += 1;
      bump(plan.after, stored);
      continue;
    }

    bump(plan.after, shelfKey(placement.app_type, placement.category));
    if (placement.app_type === row.app_type && placement.category === row.category) {
      plan.unchanged += 1;
      continue;
    }
    plan.changes.push({ id: row.id, app_type: placement.app_type, category: placement.category });
    if (placement.via === "keywords") plan.changedByKeywords += 1;
  }
  return plan;
}

/** Counts shelves for raw entries with no table and no network (the `--snapshot` check). Never throws. */
export function tallyPlacements(rawApps: readonly unknown[]): { total: number; unreadable: number; byShelf: Record<ShelfKey, number>; byKeywords: number } {
  const out = { total: 0, unreadable: 0, byShelf: {} as Record<ShelfKey, number>, byKeywords: 0 };
  for (const raw of rawApps) {
    out.total += 1;
    try {
      const placement = placeAptoideApp(raw as AptoideRawApp);
      bump(out.byShelf, shelfKey(placement.app_type, placement.category));
      if (placement.via === "keywords") out.byKeywords += 1;
    } catch {
      out.unreadable += 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Table reader and writer
// ---------------------------------------------------------------------------

export interface RederiveDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  pageSize?: number;
  patchBatch?: number;
  /** Called after each page read and each patch with a fixed-shape record (counts only). */
  onProgress?: (progress: { phase: "read" | "write"; done: number }) => void;
}

export interface RederiveReport extends RederivePlan {
  scanned: number;
  /** Rows whose PATCH was accepted. Always 0 on a dry run. */
  patched: number;
}

export type RederiveResult =
  | { ok: true; report: RederiveReport }
  | { ok: false; reason: "not_configured" | "read_failed" | "write_failed"; report: RederiveReport };

type Cfg = { baseUrl: string; key: string };

async function readPage(cfg: Cfg, afterId: string | null, limit: number, doFetch: typeof fetch, timeoutMs: number): Promise<StoredRow[] | null> {
  const query = [
    "select=id,app_type,category,raw",
    "origin=eq.aptoide",
    "order=id.asc",
    `limit=${limit}`,
    ...(afterId === null ? [] : [`id=gt.${encodeURIComponent(afterId)}`]),
  ].join("&");
  try {
    const res = await doFetch(`${cfg.baseUrl}/rest/v1/catalog_app?${query}`, {
      method: "GET",
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.error(`catalog-rederive: read refused with HTTP ${res.status}`);
      return null;
    }
    const body: unknown = await res.json();
    if (!Array.isArray(body)) return null;
    const rows: StoredRow[] = [];
    for (const item of body) {
      if (typeof item !== "object" || item === null || typeof (item as { id?: unknown }).id !== "string") return null;
      const r = item as Record<string, unknown>;
      rows.push({ id: r.id as string, app_type: String(r.app_type), category: String(r.category), raw: r.raw });
    }
    return rows;
  } catch {
    console.error("catalog-rederive: read request failed");
    return null;
  }
}

async function patchIds(cfg: Cfg, ids: readonly string[], pair: { app_type: string; category: string }, doFetch: typeof fetch, timeoutMs: number): Promise<boolean> {
  try {
    const res = await doFetch(`${cfg.baseUrl}/rest/v1/catalog_app?origin=eq.aptoide&id=in.(${ids.join(",")})`, {
      method: "PATCH",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ app_type: pair.app_type, category: pair.category }),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) console.error(`catalog-rederive: write refused with HTTP ${res.status}`);
    return res.ok;
  } catch {
    console.error("catalog-rederive: write request failed");
    return false;
  }
}

const emptyReport = (): RederiveReport => ({
  changes: [],
  unchanged: 0,
  unreadable: 0,
  before: {},
  after: {},
  changedByKeywords: 0,
  scanned: 0,
  patched: 0,
});

function merge(into: Record<ShelfKey, number>, from: Record<ShelfKey, number>): void {
  for (const [key, count] of Object.entries(from)) into[key] = (into[key] ?? 0) + count;
}

/**
 * Walks `catalog_app` (Aptoide rows), plans, and, unless `dryRun`, writes. A read that fails stops before any
 * write, so a half-read table is never half-updated. A write that fails stops there; re-running is safe
 * (the second run finds fewer rows to change).
 */
export async function rederiveCatalogCategories(opts: { dryRun: boolean }, deps: RederiveDeps = {}): Promise<RederiveResult> {
  const report = emptyReport();
  const cfg = readConfig(deps.env ?? process.env);
  if (!cfg) return { ok: false, reason: "not_configured", report };

  const doFetch = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? REDERIVE_TIMEOUT_MS;
  const pageSize = Math.max(1, Math.min(deps.pageSize ?? REDERIVE_PAGE_SIZE, 500));
  const batch = Math.max(1, Math.min(deps.patchBatch ?? REDERIVE_PATCH_BATCH, 200));

  // 1. Read everything first (ids and answers only are kept; `raw` is dropped after each page is planned).
  let after: string | null = null;
  for (;;) {
    const page = await readPage(cfg, after, pageSize, doFetch, timeoutMs);
    if (page === null) return { ok: false, reason: "read_failed", report };
    if (page.length === 0) break;
    const plan = planRederive(page);
    report.scanned += page.length;
    report.changes.push(...plan.changes);
    report.unchanged += plan.unchanged;
    report.unreadable += plan.unreadable;
    report.changedByKeywords += plan.changedByKeywords;
    merge(report.before, plan.before);
    merge(report.after, plan.after);
    deps.onProgress?.({ phase: "read", done: report.scanned });
    if (page.length < pageSize) break;
    after = page[page.length - 1].id;
  }

  if (opts.dryRun || report.changes.length === 0) return { ok: true, report };

  // 2. Write: one PATCH per distinct pair per `batch` ids.
  const groups = new Map<string, { pair: { app_type: string; category: string }; ids: string[] }>();
  for (const change of report.changes) {
    const key = shelfKey(change.app_type, change.category);
    const group = groups.get(key) ?? { pair: { app_type: change.app_type, category: change.category }, ids: [] };
    group.ids.push(change.id);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    for (let i = 0; i < group.ids.length; i += batch) {
      const ids = group.ids.slice(i, i + batch);
      if (!(await patchIds(cfg, ids, group.pair, doFetch, timeoutMs))) return { ok: false, reason: "write_failed", report };
      report.patched += ids.length;
      deps.onProgress?.({ phase: "write", done: report.patched });
    }
  }
  return { ok: true, report };
}
