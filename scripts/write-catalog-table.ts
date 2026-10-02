/**
 * Writes the fetch step's trusted results straight to the `catalog_app` table —
 * leaf `5.l.iii.zi`. Replaces `merge-aptoide-snapshot.ts` + the snapshot pull
 * request in the scheduled crawl workflow.
 *
 * Reads `aptoide-meta-results.jsonl` (one raw Aptoide app per line, written by
 * `fetch-aptoide-meta.ts`), runs the trust gate a second time (the same check the
 * merge script made), builds validated rows (`lib/catalog-load.ts`, the same code
 * the one-time loader uses) and upserts them on `id` in batches.
 *
 * On success the results file is truncated to empty (the fetch step's own
 * checkpoint, not this file, says how far it got, and it only appends), so the
 * next run writes only new results and the file never grows past one run. On any
 * failure the file is left alone, so re-running writes the same rows again:
 * harmless, the write is an upsert.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (repo secrets in the workflow).
 * Prints counts only. Exit: 0 written or nothing to write; 1 refused (bad args,
 * env not set); 2 the write stopped part-way.
 *
 * Usage:
 *   npx tsx scripts/write-catalog-table.ts
 *   npx tsx scripts/write-catalog-table.ts --dry-run   (counts only, no network, no env needed)
 *   npx tsx scripts/write-catalog-table.ts --dir storage/downloads
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCatalogRows, writeCatalogRows } from "../lib/catalog-load";
import { aptoideTrustVerdict } from "../lib/sources/aptoide";

const RESULTS_FILE = "aptoide-meta-results.jsonl";
const REPORT_FILE = "aptoide-write-last-run.json";

async function readResults(file: string): Promise<{ apps: unknown[]; malformed: number } | null> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const apps: unknown[] = [];
  let malformed = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      apps.push(JSON.parse(line));
    } catch {
      malformed += 1;
    }
  }
  return { apps, malformed };
}

async function main(): Promise<number> {
  let dir = path.join("storage", "downloads");
  let dryRun = false;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dry-run") dryRun = true;
    else if (argv[i] === "--dir" && argv[i + 1]) dir = argv[(i += 1)];
    else {
      console.error(`unknown or incomplete argument: ${argv[i]}`);
      return 1;
    }
  }

  const file = path.resolve(process.cwd(), dir, RESULTS_FILE);
  const results = await readResults(file);
  if (results === null || results.apps.length === 0) {
    console.log(`${RESULTS_FILE}: nothing to write${results ? ` (${results.malformed} malformed line(s))` : " (file not found)"}.`);
    return 0;
  }

  // Second trust check, as the merge script did: anything not TRUSTED is dropped and counted.
  let untrusted = 0;
  const trusted: unknown[] = [];
  for (const raw of results.apps) {
    if (typeof raw !== "object" || raw === null) {
      trusted.push(raw); // buildCatalogRows counts it as not normalizable
      continue;
    }
    if (aptoideTrustVerdict(raw as Parameters<typeof aptoideTrustVerdict>[0]).trusted) trusted.push(raw);
    else untrusted += 1;
  }

  const { rows, skipped } = buildCatalogRows(trusted);
  const skippedTotal = Object.values(skipped).reduce((a, b) => a + b, 0);
  console.log(`results: ${results.apps.length} (${results.malformed} malformed); untrusted: ${untrusted}; rows to write: ${rows.length}; skipped: ${skippedTotal}`);
  for (const [reason, count] of Object.entries(skipped)) if (count > 0) console.log(`  skipped ${reason}: ${count}`);

  if (dryRun) {
    console.log("dry run: nothing written, results file left as it is");
    return 0;
  }

  const result = await writeCatalogRows(rows, {
    onProgress: ({ written, total }) => console.log(`written ${written} of ${total}`),
  });
  if (!result.ok && result.reason === "not_configured") {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set (https, or http on localhost)");
    return 1;
  }
  console.log(`written: ${result.report.written}; refused by a slug/package conflict: ${result.report.conflicts}`);
  if (!result.ok) {
    console.error("the write stopped part-way; the results file was kept, re-running is safe");
    return 2;
  }

  await writeFile(file, "", "utf8");
  await writeFile(
    path.resolve(process.cwd(), dir, REPORT_FILE),
    `${JSON.stringify({ run_at: new Date().toISOString(), results: results.apps.length, untrusted, written: result.report.written, conflicts: result.report.conflicts, skipped }, null, 2)}\n`,
    "utf8",
  );
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : "unexpected error");
    process.exitCode = 1;
  },
);
