/**
 * Aptoide version history fetcher — leaf `5.h.v.zo`.
 *
 * Reads `aptoide-snapshot.json`, fetches version history for each app via
 * `listAppVersions/package_name=<pkg>`, maps it to the raw shape
 * `readVersionHistory` expects, attaches it to the app's `versions` field,
 * and saves the snapshot back.
 *
 * Usage:
 *   npx tsx scripts/fetch-aptoide-versions.ts
 *   npx tsx scripts/fetch-aptoide-versions.ts --max-requests 50
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AptoideRawApp } from "../lib/sources/aptoide";
import { loadIngestConfig } from "../lib/ingest-config";

const API_BASE = "https://ws75.aptoide.com/api/7";
const USER_AGENT = "d-store-fetch-versions/0.1 (+https://github.com/Zapier-codes/D-Store)";

const MIN_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 2000;
const BACKOFF_CAP_MS = 60000;
const RETRY_AFTER_CAP_MS = 120000;
const BLOCK_STRIKES = 3;

const SNAPSHOT_FILE = "aptoide-snapshot.json";
const REPORT_FILE = "aptoide-versions-last-run.json";

interface Args {
  maxRequests: number;
  dir: string;
}

function parseArgs(argv: string[]): Args {
  const config = loadIngestConfig();
  const args: Args = {
    maxRequests: config.fetch.maxRequests,
    dir: path.join("storage", "downloads"),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--max-requests") {
      const value = Number(argv[++i]);
      if (!Number.isSafeInteger(value) || value < 1) throw new Error(`--max-requests needs a whole number >= 1.`);
      args.maxRequests = value;
    } else if (flag === "--dir") {
      const value = argv[++i];
      if (!value) throw new Error("--dir needs a path.");
      args.dir = value;
    } else {
      throw new Error(`Unknown argument "${flag}".`);
    }
  }
  return args;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(header: string | null, nowMs: number): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (trimmed === "") return null;
  let ms: number;
  if (/^\d+$/.test(trimmed)) ms = Number(trimmed) * 1000;
  else {
    const date = Date.parse(trimmed);
    if (Number.isNaN(date)) return null;
    ms = date - nowMs;
  }
  return Math.min(Math.max(ms, 0), RETRY_AFTER_CAP_MS);
}

function backoffMs(attempt: number): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
  return Math.round(ceiling * (0.5 + Math.random() * 0.5));
}

async function readBodyCapped(res: Response, cap: number): Promise<string | null> {
  if (!res.body) {
    const text = await res.text();
    return Buffer.byteLength(text, "utf8") > cap ? null : text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

// Maps Aptoide's version list to the shape readVersionHistory expects
function mapVersions(aptoideVersions: unknown[]): unknown[] {
  return aptoideVersions.map((v) => {
    const ver = v as Record<string, unknown>;
    const file = ver.file as Record<string, unknown> | undefined;
    return {
      version_name: ver.vername,
      changelog: (ver.media as { news?: string } | undefined)?.news ?? null,
      size_bytes: file?.filesize,
      download_url: typeof file?.path === "string" ? file.path : null,
      status: "available", // Aptoide doesn't have lifecycle statuses
      rollout: { percentage: 100, status: "complete" },
    };
  });
}

async function fetchVersions(pkg: string, state: RunState): Promise<unknown[] | null> {
  const url = `${API_BASE}/listAppVersions/package_name=${encodeURIComponent(pkg)}/aab=1`;
  
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const wait = state.lastRequestAt + MIN_DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    state.lastRequestAt = Date.now();
    state.httpRequests += 1;

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      state.statusCounts[String(res.status)] = (state.statusCounts[String(res.status)] ?? 0) + 1;

      if (res.ok) {
        const body = await readBodyCapped(res, MAX_BODY_BYTES);
        if (body === null) return null;
        state.blockStrikes = 0;
        try {
          const json = JSON.parse(body);
          const list = (json?.nodes?.meta?.data?.versions?.list ?? []) as unknown[];
          return Array.isArray(list) ? mapVersions(list) : [];
        } catch {
          return null;
        }
      }

      await res.body?.cancel().catch(() => undefined);
      if (res.status === 404) return []; // No versions found is valid
      
      if (res.status === 403 || res.status === 429) {
        state.blockStrikes += 1;
        if (state.blockStrikes >= BLOCK_STRIKES) throw new Error("Blocked by Aptoide (3 strikes)");
        const delay = Math.max(backoffMs(attempt), parseRetryAfter(res.headers.get("retry-after"), Date.now()) ?? 0);
        await sleep(delay);
      } else if (res.status >= 500) {
        const delay = Math.max(backoffMs(attempt), parseRetryAfter(res.headers.get("retry-after"), Date.now()) ?? 0);
        await sleep(delay);
      } else {
        return null; // Unrecoverable
      }
    } catch (error) {
      state.statusCounts["network"] = (state.statusCounts["network"] ?? 0) + 1;
      if (attempt === MAX_ATTEMPTS) throw error;
      await sleep(backoffMs(attempt));
    }
  }
  return null;
}

interface RunState {
  httpRequests: number;
  blockStrikes: number;
  statusCounts: Record<string, number>;
  lastRequestAt: number;
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
  const snapshotPath = path.join(dir, SNAPSHOT_FILE);
  const reportPath = path.join(dir, REPORT_FILE);
  await mkdir(dir, { recursive: true });

  let apps: AptoideRawApp[];
  try {
    const text = await readFile(snapshotPath, "utf8");
    apps = JSON.parse(text) as AptoideRawApp[];
  } catch {
    console.error("Could not read aptoide-snapshot.json. Run the fetcher first.");
    return 1;
  }

  const state: RunState = { httpRequests: 0, blockStrikes: 0, statusCounts: {}, lastRequestAt: 0 };
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < apps.length; i += 1) {
    if (state.httpRequests >= args.maxRequests) {
      console.log(`Reached request cap (${args.maxRequests}). Stopping early.`);
      break;
    }

    const app = apps[i];
    console.log(`[${i + 1}/${apps.length}] Fetching versions for ${app.package}...`);

    try {
      const versions = await fetchVersions(app.package, state);
      if (versions === null) {
        console.log(`  Failed to fetch versions for ${app.package}`);
        skipped += 1;
      } else {
        app.versions = versions;
        updated += 1;
        console.log(`  Found ${versions.length} versions.`);
      }
    } catch (error) {
      console.error(`  Error fetching ${app.package}:`, error instanceof Error ? error.message : error);
      skipped += 1;
      break; // Stop on hard block
    }
  }

  await writeJsonAtomic(snapshotPath, apps);

  const report = {
    apps_total: apps.length,
    apps_updated: updated,
    apps_skipped: skipped,
    http_requests: state.httpRequests,
    status_counts: state.statusCounts,
  };
  await writeJsonAtomic(reportPath, report);

  console.log("\nSummary:");
  console.log(`  Apps updated: ${updated}`);
  console.log(`  Apps skipped: ${skipped}`);
  console.log(`  HTTP requests: ${state.httpRequests}`);
  
  return 0;
}

main().then(
  (code) => { process.exitCode = code; },
  (error: unknown) => {
    console.error("fetch failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
