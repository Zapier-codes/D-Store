/**
 * Cross-check the `catalog_app` table against the committed snapshot — leaf `5.l.ii.zo`.
 *
 * Read-only. Builds the rows the loader WOULD write (`lib/catalog-load.ts`) and
 * compares them with the table, through PostgREST with the service-role key:
 *   1. row count in the table (exact count) vs rows expected from the snapshot;
 *   2. every expected `id` is present (paged through ids only, never `raw`);
 *   3. ids in the table the snapshot does not have (extra rows);
 *   4. a spot check of the first-page read the storefront uses: `catalog_page`
 *      with order `top` returns a page, and its first slug matches the snapshot's
 *      highest `reported_downloads` (ties by slug), which also proves the
 *      migration for `catalog_page` is applied.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Prints counts and at most 10
 * example ids; never row content or the key.
 * Usage:  npx tsx scripts/check-catalog-table.ts
 * Exit:   0 everything matches; 1 could not run; 2 a mismatch was found.
 */

import path from "node:path";
import { buildCatalogRows } from "../lib/catalog-load";
import { readSnapshotFiles } from "../lib/aptoide-snapshot-io";
import { readCatalogPage } from "../lib/catalog-table";

const PAGE = 1000;

async function main(): Promise<number> {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set");
    return 1;
  }
  const base = new URL(url).origin;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const loaded = await readSnapshotFiles(path.join("storage", "downloads"));
  if (loaded.problems.length > 0) {
    console.error(`snapshot problems: ${loaded.problems.slice(0, 5).join(", ")}`);
    return 1;
  }
  const { rows } = buildCatalogRows(loaded.apps);
  const expected = new Map(rows.map((r) => [r.id, r]));
  console.log(`expected from snapshot: ${expected.size}`);

  // 1. exact count
  const head = await fetch(`${base}/rest/v1/catalog_app?select=id`, {
    method: "HEAD",
    headers: { ...headers, Prefer: "count=exact" },
    redirect: "error",
  });
  if (!head.ok) {
    console.error(`count request failed: HTTP ${head.status} (is the migration applied?)`);
    return 1;
  }
  const total = Number((head.headers.get("content-range") ?? "").split("/")[1]);
  console.log(`rows in table: ${Number.isFinite(total) ? total : "unknown"}`);

  // 2 and 3. ids, paged, ordered so the walk is stable
  const present = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${base}/rest/v1/catalog_app?select=id&order=id.asc`, {
      headers: { ...headers, Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" },
      redirect: "error",
    });
    if (!res.ok) {
      console.error(`id read failed: HTTP ${res.status}`);
      return 1;
    }
    const page = (await res.json()) as { id: string }[];
    for (const r of page) present.add(r.id);
    if (page.length < PAGE) break;
  }
  const missing = [...expected.keys()].filter((id) => !present.has(id));
  const extra = [...present].filter((id) => !expected.has(id));
  console.log(`missing from table: ${missing.length}${missing.length ? ` (e.g. ${missing.slice(0, 10).join(", ")})` : ""}`);
  console.log(`in table, not in snapshot: ${extra.length}${extra.length ? ` (e.g. ${extra.slice(0, 10).join(", ")})` : ""}`);

  // 4. the storefront's own read
  const first = await readCatalogPage({ order: "top", limit: 5 });
  let pageOk = false;
  if (!first.ok) {
    console.log(`catalog_page read: FAILED (${first.reason}) — is migration 20261002010000 applied?`);
  } else {
    const top = [...expected.values()].sort(
      (a, b) => (b.reported_downloads ?? -1) - (a.reported_downloads ?? -1) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    )[0];
    pageOk = first.rows[0]?.slug === top?.slug;
    console.log(`catalog_page read: ${first.rows.length} rows; first slug ${pageOk ? "matches" : "DIFFERS from"} the snapshot's top app`);
  }

  const countOk = Number.isFinite(total) && total >= expected.size;
  const ok = missing.length === 0 && countOk && pageOk;
  console.log(ok ? "RESULT: table matches the snapshot" : "RESULT: MISMATCH (see above)");
  return ok ? 0 : 2;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : "unexpected error");
    process.exit(1);
  },
);
