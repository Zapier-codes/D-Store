/**
 * Aptoide snapshot merger — leaf `5.h.x.zo`.
 *
 * Reads `aptoide-meta-results.jsonl` (written by `5.h.x.zi`), merges those
 * trusted raw apps into `aptoide-snapshot.json`, and writes the updated
 * snapshot back atomically.
 *
 * Merge rules:
 *   - Apps are matched by `package` name.
 *   - If an app is new, it is appended.
 *   - If an app exists, it is updated ONLY if its `modified` timestamp is
 *     newer than the one in the snapshot (refresh on `updated`).
 *   - Size check: any app with a missing or non-positive `file.filesize`
 *     is skipped and logged, so a malformed response can't corrupt the
 *     snapshot.
 *
 * Usage:
 *   npx tsx scripts/merge-aptoide-snapshot.ts
 *   npx tsx scripts/merge-aptoide-snapshot.ts --dir storage/downloads
 *
 * Network note: this script does no network I/O. It only reads and writes
 * local files in `--dir` (default `storage/downloads`).
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AptoideRawApp } from "../lib/sources/aptoide";

const RESULTS_FILE = "aptoide-meta-results.jsonl";
const SNAPSHOT_FILE = "aptoide-snapshot.json";

interface Args {
  dir: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dir: path.join("storage", "downloads") };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--dir") {
      const value = argv[++i];
      if (!value) throw new Error("--dir needs a path.");
      args.dir = value;
    } else {
      throw new Error(`Unknown argument "${flag}".`);
    }
  }
  return args;
}

async function readJsonl(file: string): Promise<AptoideRawApp[]> {
  try {
    const text = await readFile(file, "utf8");
    const apps: AptoideRawApp[] = [];
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      try {
        apps.push(JSON.parse(line));
      } catch {
        console.warn(`Skipping malformed line in ${RESULTS_FILE}`);
      }
    }
    return apps;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`${RESULTS_FILE} not found in ${path.dirname(file)}. Run scripts/fetch-aptoide-meta.ts first.`);
      throw error;
    }
    throw error;
  }
}

async function readSnapshot(file: string): Promise<AptoideRawApp[]> {
  try {
    const text = await readFile(file, "utf8");
    return JSON.parse(text) as AptoideRawApp[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return []; // No snapshot yet is fine
    }
    throw error;
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
  const resultsPath = path.join(dir, RESULTS_FILE);
  const snapshotPath = path.join(dir, SNAPSHOT_FILE);
  await mkdir(dir, { recursive: true });

  console.log(`Reading new results from ${resultsPath}...`);
  const newApps = await readJsonl(resultsPath);
  console.log(`Found ${newApps.length} trusted apps to merge.`);

  console.log(`Reading existing snapshot from ${snapshotPath}...`);
  const existingApps = await readSnapshot(snapshotPath);
  console.log(`Snapshot currently has ${existingApps.length} apps.`);

  // Build a map of existing apps by package name
  const snapshotMap = new Map<string, AptoideRawApp>();
  for (const app of existingApps) {
    if (app.package) {
      snapshotMap.set(app.package, app);
    }
  }

  let added = 0;
  let updated = 0;
  let skippedSize = 0;
  let skippedStale = 0;

  for (const newApp of newApps) {
    // Size check: skip if filesize is missing or <= 0
    if (!newApp.file || typeof newApp.file.filesize !== "number" || newApp.file.filesize <= 0) {
      console.warn(`Skipping ${newApp.package}: invalid or missing filesize`);
      skippedSize += 1;
      continue;
    }

    const existing = snapshotMap.get(newApp.package);
    if (!existing) {
      // New app
      snapshotMap.set(newApp.package, newApp);
      added += 1;
    } else {
      // Refresh on `updated` (Aptoide's `modified` field)
      // Using string comparison works for ISO 8601 / "YYYY-MM-DD HH:MM:SS" formats
      if (newApp.modified > (existing.modified ?? "")) {
        snapshotMap.set(newApp.package, newApp);
        updated += 1;
      } else {
        skippedStale += 1;
      }
    }
  }

  const finalSnapshot = Array.from(snapshotMap.values());

  console.log(`Writing updated snapshot to ${snapshotPath}...`);
  await writeJsonAtomic(snapshotPath, finalSnapshot);

  console.log("");
  console.log("Summary");
  console.log(`  Apps added: ${added}`);
  console.log(`  Apps updated: ${updated}`);
  console.log(`  Apps skipped (invalid size): ${skippedSize}`);
  console.log(`  Apps skipped (stale/not newer): ${skippedStale}`);
  console.log(`  Total apps in snapshot: ${finalSnapshot.length}`);

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
