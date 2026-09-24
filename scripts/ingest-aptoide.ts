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
 * Network note: this script talks to `ws75.aptoide.com` directly and
 * was written and schema-verified against real probe output
 * (`aptoide-probe.txt`) but not run end-to-end in the sandbox this
 * session used — that sandbox's network allowlist doesn't include
 * Aptoide's domain. Run it from an environment with normal internet
 * access (e.g. the operator's machine or CI) and check the printed
 * summary before trusting the snapshot.
 */

import { fetchAptoideApp, fetchAptoideSearch, type AptoideRawApp } from "../lib/sources/aptoide";
import { mkdir, writeFile } from "node:fs/promises";
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

  for (const pkg of args.packages) {
    try {
      const app = await fetchAptoideApp(pkg);
      if (app) byPackage.set(app.package, app);
      else errors.push(`${pkg}: not found`);
    } catch (err) {
      errors.push(`${pkg}: ${(err as Error).message}`);
    }
  }

  for (const query of args.searches) {
    try {
      const results = await fetchAptoideSearch(query, args.limit);
      for (const app of results) byPackage.set(app.package, app);
    } catch (err) {
      errors.push(`search "${query}": ${(err as Error).message}`);
    }
  }

  const snapshot = Array.from(byPackage.values());
  const outDir = path.join(process.cwd(), "storage", "downloads");
  const outFile = path.join(outDir, "aptoide-snapshot.json");
  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, JSON.stringify(snapshot, null, 2), "utf-8");

  console.log(`Wrote ${snapshot.length} app(s) to ${outFile}`);
  if (errors.length) {
    console.log(`${errors.length} error(s):`);
    for (const e of errors) console.log(`  - ${e}`);
  }
}

main();
