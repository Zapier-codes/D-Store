/**
 * Aptoide ingestion script — leaf `5.h.ii.zo` groundwork.
 *
 * Calls Aptoide's real API for a list of package names and/or search
 * queries, and writes the raw results to
 * `storage/downloads/aptoide-snapshot.json` — the file
 * `lib/sources/aptoide.ts`'s `createAptoideSource()` reads at request
 * time. This is a manual/cron-able script, not the scheduled server-side
 * job `5.h.ii.zo` ultimately calls for (HANDOVER.md: "server-side and
 * scheduled... never a per-request call") — no scheduler infra exists
 * in this repo yet, so this is the piece that job would call, run by
 * hand for now.
 *
 * Usage:
 *   npx tsx scripts/ingest-aptoide.ts --packages com.whatsapp,org.mozilla.firefox
 *   npx tsx scripts/ingest-aptoide.ts --search "password manager" --limit 5
 *   (both flags can be combined; results are deduped by package name)
 *
 * Trust gate (`5.h.iv.zo`): a response is kept only when Aptoide's own
 * `file.malware.rank` is exactly "TRUSTED". Everything else (UNKNOWN, WARN,
 * a missing rank, ...) is dropped from the snapshot and listed in the printed
 * summary with its package and reason — never skipped silently. The same gate
 * applies to `--packages` and `--search`.
 *
 * Network note: this script talks to `ws75.aptoide.com` directly and
 * was written and schema-verified against real probe output
 * (`aptoide-probe.txt`) but not run end-to-end in the sandbox this
 * session used — that sandbox's network allowlist doesn't include
 * Aptoide's domain. Run it from an environment with normal internet
 * access (e.g. the operator's machine or CI) and check the printed
 * summary before trusting the snapshot.
 */

import { aptoideTrustVerdict, fetchAptoideApp, fetchAptoideSearch, type AptoideRawApp } from "../lib/sources/aptoide";
import { writeSnapshotFiles } from "../lib/aptoide-snapshot-io";
import path from "node:path";

interface Args {
  packages: string[];
  searches: string[];
  limit: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { packages: [], searches: [], limit: 10 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--packages") {
      args.packages = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg === "--search") {
      args.searches.push(argv[++i] ?? "");
    } else if (arg === "--limit") {
      args.limit = Number(argv[++i]) || 10;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.packages.length === 0 && args.searches.length === 0) {
    console.error("Nothing to ingest. Pass --packages a,b,c and/or --search \"query\".");
    process.exitCode = 1;
    return;
  }

  const byPackage = new Map<string, AptoideRawApp>();
  const errors: string[] = [];
  const skipped: string[] = [];

  // 5.h.iv.zo — the single place a response enters the snapshot.
  const admit = (app: AptoideRawApp): void => {
    const verdict = aptoideTrustVerdict(app);
    if (verdict.trusted) byPackage.set(app.package, app);
    else skipped.push(`${app.package}: ${verdict.reason}`);
  };

  for (const pkg of args.packages) {
    try {
      const app = await fetchAptoideApp(pkg);
      if (app) admit(app);
      else errors.push(`${pkg}: not found`);
    } catch (err) {
      errors.push(`${pkg}: ${(err as Error).message}`);
    }
  }

  for (const query of args.searches) {
    try {
      const results = await fetchAptoideSearch(query, args.limit);
      for (const app of results) admit(app);
    } catch (err) {
      errors.push(`search "${query}": ${(err as Error).message}`);
    }
  }

  const snapshot = Array.from(byPackage.values());
  const outDir = path.join(process.cwd(), "storage", "downloads");
  // 5.h.x.zo — written through the shared writer, so a snapshot that has grown
  // past one file is replaced as a whole (shards and header) and no stale shard
  // from an earlier run is left behind. This script still REPLACES the snapshot
  // with exactly what it fetched; it does not merge (that is merge-aptoide-snapshot.ts).
  const report = await writeSnapshotFiles(outDir, snapshot, { generatedAt: new Date().toISOString(), runnerCountry: null });

  console.log(`Wrote ${snapshot.length} app(s) to ${path.join(outDir, report.written.join(", "))}`);
  if (skipped.length) {
    console.log(`${skipped.length} skipped by the trust gate (Aptoide's file.malware.rank is not "TRUSTED"):`);
    for (const e of skipped) console.log(`  - ${e}`);
  }
  if (errors.length) {
    console.log(`${errors.length} error(s):`);
    for (const e of errors) console.log(`  - ${e}`);
  }
}

main();
