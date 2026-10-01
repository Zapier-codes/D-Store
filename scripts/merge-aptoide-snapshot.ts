/**
 * Aptoide snapshot merger — leaf `5.h.x.zo`.
 *
 * Reads `aptoide-meta-results.jsonl` (written by `5.h.x.zi`), merges those
 * raw apps into the snapshot in `storage/downloads`, and writes it back as one
 * or more shards plus a header. The rules live in `lib/aptoide-snapshot.ts`
 * (pure, unit-tested); this file only reads and writes files.
 *
 *   - Matched by `package`. New apps are appended; a stored app is replaced
 *     only when the incoming copy is strictly newer on `updated` (or on
 *     `modified` when neither side has a usable `updated`); equal or older is
 *     left alone.
 *   - An incoming app without a package, or without a positive `file.filesize`,
 *     is skipped and counted. An incoming app whose `file.malware.rank` is not
 *     `TRUSTED` is skipped and counted too (the fetcher already filters; this
 *     is the second check, in case the results file was edited or came from
 *     elsewhere).
 *   - Size: one file holds at most 8 MiB. Past that the snapshot is split
 *     into `aptoide-snapshot.json`, `aptoide-snapshot.2.json`, ... and the
 *     header `aptoide-snapshot.meta.json` lists them. Shards left over from a
 *     larger earlier snapshot are deleted.
 *   - Header: run time, app count, runner country (copied from the crawl's
 *     `aptoide-crawl-last-run.json` when it is there, else `null`), the limit,
 *     and each shard's file, count and bytes.
 *
 * The existing snapshot is READ FIRST and the script refuses to write if it
 * has a problem (a missing shard, an unreadable file, a count that disagrees
 * with the header): writing from a partial read would silently drop apps. Fix
 * or delete the damaged files and run again.
 *
 * Usage:
 *   npx tsx scripts/merge-aptoide-snapshot.ts
 *   npx tsx scripts/merge-aptoide-snapshot.ts --dir storage/downloads
 *   npx tsx scripts/merge-aptoide-snapshot.ts --dry-run
 *   npx tsx scripts/merge-aptoide-snapshot.ts --limit-bytes 65536   (to try sharding on a small file)
 *
 * Network note: this script does no network I/O.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { SNAPSHOT_SHARD_LIMIT_BYTES, mergeSnapshot, type MergeCounts } from "../lib/aptoide-snapshot";
import { readSnapshotFiles, writeSnapshotFiles } from "../lib/aptoide-snapshot-io";
import { aptoideTrustVerdict } from "../lib/sources/aptoide";

const RESULTS_FILE = "aptoide-meta-results.jsonl";
const CRAWL_REPORT_FILE = "aptoide-crawl-last-run.json";
const REPORT_FILE = "aptoide-merge-last-run.json";

interface Args {
  dir: string;
  dryRun: boolean;
  limitBytes: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dir: path.join("storage", "downloads"), dryRun: false, limitBytes: SNAPSHOT_SHARD_LIMIT_BYTES };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--dir") {
      const value = argv[++i];
      if (!value) throw new Error("--dir needs a path.");
      args.dir = value;
    } else if (flag === "--dry-run") {
      args.dryRun = true;
    } else if (flag === "--limit-bytes") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1024) throw new Error("--limit-bytes needs a whole number of at least 1024.");
      args.limitBytes = n;
    } else {
      throw new Error(`Unknown argument "${flag}".`);
    }
  }
  return args;
}

async function readResults(file: string): Promise<{ apps: unknown[]; malformedLines: number }> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`${RESULTS_FILE} not found in ${path.dirname(file)}. Run scripts/fetch-aptoide-meta.ts first.`);
    }
    throw error;
  }
  const apps: unknown[] = [];
  let malformedLines = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      apps.push(JSON.parse(line));
    } catch {
      malformedLines += 1;
    }
  }
  return { apps, malformedLines };
}

/** The runner country the crawl recorded, or `null` when there is no report or it has none. Best effort. */
async function readRunnerCountry(dir: string): Promise<string | null> {
  try {
    const report = JSON.parse(await readFile(path.join(dir, CRAWL_REPORT_FILE), "utf8")) as { runner_country?: unknown };
    return typeof report.runner_country === "string" && /^[A-Za-z]{2}$/.test(report.runner_country) ? report.runner_country : null;
  } catch {
    return null;
  }
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }

  const dir = path.resolve(process.cwd(), args.dir);
  await mkdir(dir, { recursive: true });

  const resultsPath = path.join(dir, RESULTS_FILE);
  console.log(`Reading new results from ${resultsPath}...`);
  const { apps: results, malformedLines } = await readResults(resultsPath);
  console.log(`Read ${results.length} results (${malformedLines} malformed line(s) skipped).`);

  // Second trust check. Counted, and every refusal is logged with its reason.
  let untrusted = 0;
  const trusted: unknown[] = [];
  for (const raw of results) {
    if (typeof raw !== "object" || raw === null) {
      trusted.push(raw); // `mergeSnapshot` counts it as invalid
      continue;
    }
    const verdict = aptoideTrustVerdict(raw as Parameters<typeof aptoideTrustVerdict>[0]);
    if (verdict.trusted) trusted.push(raw);
    else {
      untrusted += 1;
      const pkg = (raw as { package?: unknown }).package;
      console.warn(`Skipping ${typeof pkg === "string" ? pkg.slice(0, 120) : "(no package)"}: ${verdict.reason}`);
    }
  }

  const existing = await readSnapshotFiles(dir);
  if (existing.problems.length > 0) {
    console.error(`The existing snapshot has problems, so nothing was written: ${existing.problems.join(", ")}`);
    console.error("Repair or delete the damaged snapshot files (aptoide-snapshot*.json) and run again.");
    return 1;
  }
  console.log(`Snapshot currently has ${existing.apps.length} apps${existing.meta ? ` in ${existing.meta.shards.length} shard(s)` : " (no header)"}.`);

  const merged = mergeSnapshot(existing.apps, trusted);
  for (const bad of merged.invalid) console.warn(`Skipping ${bad.package ?? "(no package)"}: ${bad.reason}`);

  const counts: MergeCounts & { untrusted: number; malformed_lines: number } = { ...merged.counts, untrusted, malformed_lines: malformedLines };
  const generatedAt = new Date().toISOString();
  const runnerCountry = await readRunnerCountry(dir);

  let shardsWritten = 0;
  let removed: string[] = [];
  let totalBytes = 0;
  if (args.dryRun) {
    console.log("Dry run: nothing written.");
  } else {
    const report = await writeSnapshotFiles(dir, merged.apps, { generatedAt, runnerCountry, limitBytes: args.limitBytes });
    shardsWritten = report.written.length;
    removed = report.removed;
    totalBytes = report.meta.total_bytes;
    console.log(`Wrote ${report.written.join(", ")} and aptoide-snapshot.meta.json (${totalBytes} bytes in ${shardsWritten} shard(s), limit ${args.limitBytes} each).`);
    if (removed.length > 0) console.log(`Removed stale shard(s): ${removed.join(", ")}`);
    if (report.oversize > 0) console.warn(`${report.oversize} app(s) are larger than the limit on their own and sit alone in a shard.`);
  }

  console.log("");
  console.log("Summary");
  console.log(`  Apps added:                  ${counts.added}`);
  console.log(`  Apps refreshed (newer):      ${counts.refreshed}`);
  console.log(`  Apps unchanged (same stamp): ${counts.unchanged}`);
  console.log(`  Apps skipped (older):        ${counts.stale}`);
  console.log(`  Apps skipped (no stamp):     ${counts.incomparable}`);
  console.log(`  Apps skipped (invalid):      ${counts.invalid}`);
  console.log(`  Apps skipped (untrusted):    ${counts.untrusted}`);
  console.log(`  Duplicates in the batch:     ${counts.duplicates_in_batch}`);
  console.log(`  Stored entries dropped:      ${counts.existing_dropped}`);
  console.log(`  Total apps in snapshot:      ${merged.apps.length}`);

  if (!args.dryRun) {
    await writeJsonAtomic(path.join(dir, REPORT_FILE), {
      run_at: generatedAt,
      runner_country: runnerCountry,
      limit_bytes: args.limitBytes,
      shards: shardsWritten,
      total_bytes: totalBytes,
      total_apps: merged.apps.length,
      removed_shards: removed,
      counts,
    });
  }
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error("merge failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
