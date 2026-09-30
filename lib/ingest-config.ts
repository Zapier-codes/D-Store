/**
 * Editable ingest settings — leaf `5.h.xi.zi`.
 *
 * Loads `config/aptoide-ingest.json` synchronously so the scripts can use
 * the values as defaults. Falls back to safe defaults if the file is
 * missing, unreadable, or missing fields.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

export interface IngestConfig {
  crawl: {
    maxRequests: number;
    maxCandidates: number;
    limit: number;
    delayMs: number;
  };
  fetch: {
    maxRequests: number;
    delayMs: number;
  };
}

const DEFAULT_CONFIG: IngestConfig = {
  crawl: {
    maxRequests: 60,
    maxCandidates: 5000,
    limit: 100,
    delayMs: 1000,
  },
  fetch: {
    maxRequests: 50,
    delayMs: 1000,
  },
};

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadIngestConfig(): IngestConfig {
  try {
    const file = path.join(process.cwd(), "config", "aptoide-ingest.json");
    const text = readFileSync(file, "utf8");
    const parsed = JSON.parse(text);
    return {
      crawl: {
        maxRequests: safeNumber(parsed?.crawl?.maxRequests, DEFAULT_CONFIG.crawl.maxRequests),
        maxCandidates: safeNumber(parsed?.crawl?.maxCandidates, DEFAULT_CONFIG.crawl.maxCandidates),
        limit: safeNumber(parsed?.crawl?.limit, DEFAULT_CONFIG.crawl.limit),
        delayMs: safeNumber(parsed?.crawl?.delayMs, DEFAULT_CONFIG.crawl.delayMs),
      },
      fetch: {
        maxRequests: safeNumber(parsed?.fetch?.maxRequests, DEFAULT_CONFIG.fetch.maxRequests),
        delayMs: safeNumber(parsed?.fetch?.delayMs, DEFAULT_CONFIG.fetch.delayMs),
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}
