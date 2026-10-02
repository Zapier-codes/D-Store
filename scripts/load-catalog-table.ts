/**
 * One-time load of the committed Aptoide snapshot into the `catalog_app` table —
 * leaf `5.l.ii.zo`.
 *
 * Reads every shard in `storage/downloads` (refusing to run if the snapshot has a
 * problem, the same rule as the merge script: a partial read would load a partial
 * catalog), builds and validates the rows (`lib/catalog-load.ts`), and upserts them
 * in batches of 100. Safe to re-run: rows are upserted on `id`, so a second run
 * refreshes the derived columns from `raw` and adds nothing twice.
 *
 * BEFORE RUNNING (operator): the migrations `20261002000000_create_catalog_app.sql`
 * and `20261002010000_catalog_page_function.sql` must be applied to the D-Store
 * Supabase project (`bash scripts/apply-migrations.sh`), and these must be set:
 *   SUPABASE_URL                the D-Store project (never Zealot's)
 *   SUPABASE_SERVICE_ROLE_KEY   its service-role key
 *
 * Usage:
 *   npx tsx scripts/load-catalog-table.ts --dry-run   (builds rows, prints counts, no network, needs no env)
 *   npx tsx scripts/load-catalog-table.ts             (writes)
 *   npx tsx scripts/load-catalog-table.ts --dir storage/downloads --batch 50
 *
 * Output is counts only (no row content, no key). Exit codes: 0 done (or dry run),
 * 1 refused (snapshot problem, bad args, env not set), 2 the write stopped part-way
 * (re-running is safe).
 */

import path from "node:path";
import { LOAD_BATCH_SIZE, buildCatalogRows, writeCatalogRows } from "../lib/catalog-load";
import { readSnapshotFiles } from "../lib/aptoide-snapshot-io";

interface Args {
  dir: string;
  dryRun: boolean;
  batch: number;
}

function parseArgs(argv: string[]): Args | string {
  const args: Args = { dir: path.join("storage", "downloads"), dryRun: false, batch: LOAD_BATCH_SIZE };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--dry-run") args.dryRun = true;
    else if (flag === "--dir") {
      const value = argv[(i += 1)];
      if (!value) return "--dir needs a value";
      args.dir = value;
    } else if (flag === "--batch") {
      const value = Number(argv[(i += 1)]);
      if (!Number.isInteger(value) || value < 1 || value > 500) return "--batch must be a whole number from 1 to 500";
      args.batch = value;
    } else return `unknown argument: ${flag}`;
  }
  return args;
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  if (typeof parsed === "string") {
    console.error(parsed);
    return 1;
  }

  const loaded = await readSnapshotFiles(parsed.dir);
  if (loaded.problems.length > 0) {
    console.error(`snapshot problems, refusing to load a partial catalog: ${loaded.problems.slice(0, 5).join(", ")}`);
    return 1;
  }

  const { rows, skipped } = buildCatalogRows(loaded.apps);
  const skippedTotal = Object.values(skipped).reduce((a, b) => a + b, 0);
  console.log(`snapshot apps: ${loaded.apps.length}; rows to write: ${rows.length}; skipped: ${skippedTotal}`);
  for (const [reason, count] of Object.entries(skipped)) if (count > 0) console.log(`  skipped ${reason}: ${count}`);

  if (parsed.dryRun) {
    console.log("dry run: nothing written");
    return 0;
  }

  const result = await writeCatalogRows(rows, {
    batchSize: parsed.batch,
    onProgress: ({ written, total }) => console.log(`written ${written} of ${total}`),
  });
  if (!result.ok && result.reason === "not_configured") {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set (https, or http on localhost)");
    return 1;
  }
  console.log(`written: ${result.report.written}; refused by a slug/package conflict: ${result.report.conflicts}`);
  if (!result.ok) {
    console.error("the write stopped part-way; re-running is safe");
    return 2;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : "unexpected error");
    process.exit(1);
  },
);
