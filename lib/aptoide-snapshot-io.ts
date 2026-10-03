/**
 * Filesystem side of the Aptoide snapshot — leaf `5.h.x.zo`.
 *
 * Imported by SCRIPTS ONLY (`scripts/merge-aptoide-snapshot.ts`,
 * `scripts/fetch-aptoide-versions.ts`, `scripts/ingest-aptoide.ts`, the catalog
 * table scripts). The storefront never imports this file (a static `node:fs`
 * import) and, since leaf `5.l.xix.zo`, never reads the snapshot at all.
 *
 * Writing order, so an interrupted run never leaves a header that promises
 * shards that are not there: every new shard goes to a `.tmp` file first, the
 * `.tmp` files are renamed into place, the header is written last, and shards
 * left over from an earlier, larger snapshot are deleted after that.
 */

import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  SNAPSHOT_META_FILE,
  SNAPSHOT_SHARD_LIMIT_BYTES,
  buildSnapshotMeta,
  isShardFileName,
  loadSnapshotFrom,
  planShards,
  serializeApp,
  serializeShard,
  shardFileName,
  shardIndexOf,
  type LoadedSnapshot,
  type SnapshotMeta,
} from "./aptoide-snapshot";

/** A `readText` for `loadSnapshotFrom` over `dir`: the file's text, `null` when it does not exist, a throw for anything else. */
export function fsReadText(dir: string): (fileName: string) => Promise<string | null> {
  return async (fileName) => {
    if (fileName !== SNAPSHOT_META_FILE && !isShardFileName(fileName)) throw new Error(`refusing to read "${fileName}": not a snapshot file name`);
    try {
      return await readFile(path.join(dir, fileName), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
}

/** Read the whole snapshot in `dir` (all shards). See `loadSnapshotFrom` for what `problems` means. */
export function readSnapshotFiles(dir: string): Promise<LoadedSnapshot> {
  return loadSnapshotFrom(fsReadText(dir));
}

export interface WriteReport {
  meta: SnapshotMeta;
  /** Shard files written, in order. */
  written: string[];
  /** Stale shard files from an earlier, larger snapshot that were deleted. */
  removed: string[];
  oversize: number;
}

/**
 * Write `apps` into `dir` as one or more shards plus the header. Throws before
 * touching anything if the plan itself fails (more than `MAX_SHARDS` shards).
 */
export async function writeSnapshotFiles(
  dir: string,
  apps: readonly unknown[],
  opts: { generatedAt: string; runnerCountry: string | null; limitBytes?: number },
): Promise<WriteReport> {
  const limitBytes = opts.limitBytes ?? SNAPSHOT_SHARD_LIMIT_BYTES;
  const plan = planShards(apps.map(serializeApp), limitBytes);
  const meta = buildSnapshotMeta({ generatedAt: opts.generatedAt, runnerCountry: opts.runnerCountry, plan, limitBytes });
  await mkdir(dir, { recursive: true });

  const written: string[] = [];
  const pending: { tmp: string; final: string }[] = [];
  for (let i = 0; i < plan.shards.length; i += 1) {
    const final = path.join(dir, shardFileName(i));
    const tmp = `${final}.tmp`;
    await writeFile(tmp, serializeShard(plan.shards[i]), "utf8");
    pending.push({ tmp, final });
  }
  for (const p of pending) {
    await rename(p.tmp, p.final);
    written.push(path.basename(p.final));
  }
  const metaFinal = path.join(dir, SNAPSHOT_META_FILE);
  await writeFile(`${metaFinal}.tmp`, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  await rename(`${metaFinal}.tmp`, metaFinal);

  const removed: string[] = [];
  for (const name of await readdir(dir)) {
    const idx = shardIndexOf(name);
    if (idx !== null && idx >= plan.shards.length) {
      await unlink(path.join(dir, name));
      removed.push(name);
    }
  }
  removed.sort();
  return { meta, written, removed, oversize: plan.oversize };
}
