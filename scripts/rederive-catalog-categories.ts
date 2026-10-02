/**
 * Re-derive `category` and `app_type` for the rows already in `catalog_app` — leaf `5.l.viii.zo`.
 *
 * Reads each Aptoide row's stored `raw` from the table, decides its shelf with the same function the
 * normalizer uses (curated package table, then `media.keywords`, then `uncategorized`), and PATCHes only the two
 * columns, and only on rows whose answer differs. No call to Aptoide. See `lib/catalog-rederive.ts`.
 *
 * Modes:
 *   --snapshot   no network, no env: counts shelves for the committed snapshot in `storage/downloads`
 *                (the same raw responses the table was loaded from). Use it first, anywhere, to see the
 *                coverage figure. It cannot show "before" or what would change, only the result.
 *   --dry-run    reads the table (needs the env below), prints before/after counts, writes nothing.
 *   (neither)    reads the table, then writes the changes.
 *
 * Needs for --dry-run and the real run:
 *   SUPABASE_URL                the D-Store project (never Zealot's)
 *   SUPABASE_SERVICE_ROLE_KEY   its service-role key
 *
 * Usage:
 *   npx tsx scripts/rederive-catalog-categories.ts --snapshot
 *   npx tsx scripts/rederive-catalog-categories.ts --dry-run
 *   npx tsx scripts/rederive-catalog-categories.ts
 *   options: --dir storage/downloads (with --snapshot), --page 100 (rows read per request, 1 to 500),
 *            --batch 100 (ids per write, 1 to 200)
 *
 * Output is counts only (shelf names and numbers; no row, no id, no key). Safe to re-run: the second run
 * finds nothing left to change. Exit codes: 0 done (or a dry run or snapshot count), 1 refused (bad args, env
 * not set, snapshot problem), 2 the table could not be read or the write stopped part-way.
 */

import path from "node:path";
import { REDERIVE_PAGE_SIZE, REDERIVE_PATCH_BATCH, rederiveCatalogCategories, tallyPlacements } from "../lib/catalog-rederive";
import { readSnapshotFiles } from "../lib/aptoide-snapshot-io";

interface Args {
  dir: string;
  dryRun: boolean;
  snapshot: boolean;
  page: number;
  batch: number;
}

function parseArgs(argv: string[]): Args | string {
  const args: Args = { dir: path.join("storage", "downloads"), dryRun: false, snapshot: false, page: REDERIVE_PAGE_SIZE, batch: REDERIVE_PATCH_BATCH };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--dry-run") args.dryRun = true;
    else if (flag === "--snapshot") args.snapshot = true;
    else if (flag === "--dir") {
      const value = argv[(i += 1)];
      if (!value) return "--dir needs a value";
      args.dir = value;
    } else if (flag === "--page") {
      const value = Number(argv[(i += 1)]);
      if (!Number.isInteger(value) || value < 1 || value > 500) return "--page must be a whole number from 1 to 500";
      args.page = value;
    } else if (flag === "--batch") {
      const value = Number(argv[(i += 1)]);
      if (!Number.isInteger(value) || value < 1 || value > 200) return "--batch must be a whole number from 1 to 200";
      args.batch = value;
    } else return `unknown argument: ${flag}`;
  }
  if (args.snapshot && args.dryRun) return "--snapshot and --dry-run are separate modes; pick one";
  return args;
}

/** `app/tools: 258` lines, biggest first, ties by name. */
function printShelves(title: string, counts: Record<string, number>): void {
  console.log(title);
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [shelf, count] of entries) console.log(`  ${shelf}: ${count}`);
}

const percent = (part: number, whole: number): string => (whole === 0 ? "n/a" : `${((part / whole) * 100).toFixed(1)}%`);

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  if (typeof parsed === "string") {
    console.error(parsed);
    return 1;
  }

  if (parsed.snapshot) {
    const loaded = await readSnapshotFiles(parsed.dir);
    if (loaded.problems.length > 0) {
      console.error(`snapshot problems: ${loaded.problems.slice(0, 5).join(", ")}`);
      return 1;
    }
    const tally = tallyPlacements(loaded.apps);
    const unplaced = (tally.byShelf["app/uncategorized"] ?? 0) + (tally.byShelf["game/uncategorized"] ?? 0);
    const placed = tally.total - tally.unreadable - unplaced;
    console.log(`snapshot apps: ${tally.total}; unreadable: ${tally.unreadable}`);
    console.log(`placed by keywords (not by the curated package table): ${tally.byKeywords}`);
    console.log(`on a real shelf: ${placed} of ${tally.total} (${percent(placed, tally.total)})`);
    printShelves("shelves after:", tally.byShelf);
    console.log("snapshot count: nothing written");
    return 0;
  }

  const result = await rederiveCatalogCategories(
    { dryRun: parsed.dryRun },
    {
      pageSize: parsed.page,
      patchBatch: parsed.batch,
      onProgress: ({ phase, done }) => console.log(`${phase === "read" ? "read" : "written"} ${done}`),
    },
  );
  if (!result.ok && result.reason === "not_configured") {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set (https, or http on localhost)");
    return 1;
  }

  const r = result.report;
  console.log(`rows read: ${r.scanned}; to change: ${r.changes.length} (of which placed by keywords: ${r.changedByKeywords}); already right: ${r.unchanged}; unreadable, left as stored: ${r.unreadable}`);
  printShelves("shelves before:", r.before);
  printShelves("shelves after:", r.after);
  if (!result.ok) {
    console.error(result.reason === "read_failed" ? "the table could not be read; nothing was written" : `the write stopped part-way after ${r.patched} rows; re-running is safe`);
    return 2;
  }
  console.log(parsed.dryRun ? "dry run: nothing written" : `written: ${r.patched}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : "unexpected error");
    process.exit(1);
  },
);
