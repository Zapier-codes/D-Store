/**
 * Zealot catalog-index build-time snapshot — leaf `5.g.iv.zi`.
 *
 * Runs as an npm `prebuild` step (wired in `package.json`, runs
 * automatically before `next build` whenever the build is invoked via
 * `npm run build`, which is what `vercel.json`'s `buildCommand` does).
 * Zealot calls a Vercel Deploy Hook after each publish, which triggers a
 * fresh Vercel build, which runs this script before `next build` starts.
 *
 * What this does that the runtime reader (`lib/sources/zealot.ts`,
 * `5.g.i.zi`) does not:
 *
 * 1. Fetches `index.json`/`index.json.sig` through the GitHub REST
 *    Contents API (`api.github.com/repos/.../contents/...?ref=...`,
 *    `Accept: application/vnd.github.raw`) — i.e. straight from the git
 *    blob the Pages repo's publish commit created — instead of the
 *    published GitHub Pages site itself. This is deliberate: Pages sits
 *    behind a CDN with its own cache lifetime, so a build immediately
 *    after a publish could otherwise read a stale copy; the Contents API
 *    reads the committed blob directly, no CDN layer to go stale.
 * 2. Verifies every referenced file's real SHA-256 against the value the
 *    index claims for it — the gap `5.g.i.zi`'s own Done note explicitly
 *    flagged and deferred ("does NOT download and hash the APK itself at
 *    read time... revisit if/when a stronger guarantee is needed").
 *    Read time (a Vercel serverless function, called per visitor) is the
 *    wrong place for that: downloading every binary on every request is
 *    real bandwidth/latency cost for no benefit past the first check.
 *    Build time (once per publish, not once per visitor) is exactly the
 *    right place, which is what makes this its own leaf rather than a
 *    change to `5.g.i.zi`'s reader.
 *
 * Only NEW or CHANGED (url, sha256) pairs are re-hashed each run, diffed
 * against the previously-committed cache -- see `filterUnverifiedVersions`
 * below for why re-checking a file this script already confirmed once is
 * pure waste, not extra safety.
 *
 * If nothing is configured, the fetch fails, or ANY check fails (bad
 * signature, wrong schema, expired, rolled back, or a single mismatched
 * file hash), this script leaves the last good `storage/downloads/
 * zealot-index-cache.json` / `zealot-index-state.json` untouched and
 * exits 0 -- a quiet no-op, not a failed build. Per this leaf's own
 * spec: "If the fetch fails, the build keeps the last good snapshot."
 * A build that hard-fails every time Zealot's Pages site has a transient
 * hiccup would be a worse outcome than briefly shipping last week's
 * snapshot, same tradeoff `fetchLiveIndex`'s own header comment already
 * accepts for the runtime path.
 *
 * Configuration (unset = skip, matching every other optional-source
 * convention this repo already uses -- `ZEALOT_CATALOG_INDEX_BASE_URL`,
 * `APTOIDE_INGEST_PACKAGES`, etc.):
 *   ZEALOT_CATALOG_PAGES_REPO   "owner/repo" of the published Pages repo
 *   ZEALOT_CATALOG_PAGES_BRANCH branch the publish commits land on (default "main")
 *   GITHUB_TOKEN                optional -- lifts the Contents API's 60/hr
 *                                unauthenticated rate limit to 5,000/hr;
 *                                Vercel/GitHub Actions both expose one by
 *                                default for same-org repos.
 *
 * Flagged, not fixed here (deliberately smaller scope than a full
 * rebuild, same posture other leaves in HANDOVER.md already use for
 * their own flagged gaps):
 * (1) Each candidate file is pulled fully into memory
 *     (`res.arrayBuffer()`) to hash it, not streamed -- simpler, but a
 *     large APK means real peak memory during the build. Streaming
 *     through `crypto.createHash` fed by the response body would remove
 *     this, at the cost of more code; not done here.
 * (2) A single network error while hashing ANY one candidate file
 *     rejects the WHOLE index for this run (same "collapse every
 *     rejection reason to one outcome" convention `validateIndex`
 *     already uses) -- one flaky download blocks a snapshot refresh
 *     that might otherwise be entirely legitimate. Retrying that one
 *     file a bounded number of times before giving up would be a
 *     reasonable follow-up, not built here.
 * (3) Not exercised end-to-end in this sandbox: there is no real
 *     `ZEALOT_CATALOG_PAGES_REPO` reachable here (no live Zealot
 *     deployment, same class of limitation every other live-Zealot-
 *     dependent leaf in this file already flags). Verified instead by:
 *     `tsc --noEmit`/`next build` passing with this file in the tree,
 *     the "nothing configured -> quiet skip" path exercised directly by
 *     running this script with the env var unset, and the diff/hash
 *     logic (`filterUnverifiedVersions`, `sha256Hex`) reviewed against
 *     `lib/sources/zealot.ts`'s existing `RawIndex`/`RawApp` shapes
 *     rather than run against a real signed index.
 */

import { createHash } from "node:crypto";
import {
  validateIndex,
  commitIndexState,
  readJsonFile,
  CACHE_FILE,
  type RawIndex,
  type RawApp,
} from "../lib/sources/zealot";

function log(message: string): void {
  console.log(`[snapshot-zealot-index] ${message}`);
}

/** A version is "already verified" if the exact same (download_url, sha256) pair appears anywhere in the last committed cache -- that pairing was already hashed and confirmed to match on a prior successful run, and neither half of it can change without becoming a different pair. */
function alreadyVerifiedPairs(previous: RawIndex | null): Set<string> {
  const pairs = new Set<string>();
  if (!previous) return pairs;
  for (const app of previous.apps) {
    for (const version of app.versions) {
      if (version.download_url && version.sha256) {
        pairs.add(`${version.download_url}|${version.sha256}`);
      }
    }
  }
  return pairs;
}

interface Candidate {
  packageLabel: string;
  url: string;
  claimedSha256: string;
}

/** Every (app, version) pair in the candidate index that has both a real https download URL and a claimed SHA-256, minus whatever the previous cache already verified -- the actual work list for this run. */
function filterUnverifiedVersions(candidate: RawIndex, previous: RawIndex | null): Candidate[] {
  const verified = alreadyVerifiedPairs(previous);
  const work: Candidate[] = [];
  for (const app of candidate.apps as RawApp[]) {
    for (const version of app.versions) {
      if (!version.download_url || !version.download_url.startsWith("https://")) continue;
      if (!version.sha256) continue;
      const pairKey = `${version.download_url}|${version.sha256}`;
      if (verified.has(pairKey)) continue;
      work.push({
        packageLabel: `${app.package_name ?? app.slug}@${version.version_name ?? "?"}`,
        url: version.download_url,
        claimedSha256: version.sha256.toLowerCase(),
      });
    }
  }
  return work;
}

async function sha256Hex(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return createHash("sha256").update(buf).digest("hex");
}

async function fetchViaGitHubContentsApi(repo: string, branch: string, path: string, token: string | undefined): Promise<string | null> {
  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.raw",
    "User-Agent": "d-store-snapshot-script",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
      log(`GitHub Contents API returned ${res.status} for ${path} -- keeping last good snapshot.`);
      return null;
    }
    return await res.text();
  } catch (err) {
    log(`Network error fetching ${path} via GitHub Contents API: ${(err as Error).message} -- keeping last good snapshot.`);
    return null;
  }
}

async function main(): Promise<void> {
  const repo = process.env.ZEALOT_CATALOG_PAGES_REPO?.trim();
  const branch = process.env.ZEALOT_CATALOG_PAGES_BRANCH?.trim() || "main";
  const token = process.env.GITHUB_TOKEN?.trim() || undefined;

  if (!repo) {
    log("ZEALOT_CATALOG_PAGES_REPO is unset -- nothing to snapshot. Keeping last good storage/downloads/zealot-index-cache.json as-is. This is the quiet, non-failing default until a real Pages repo is configured (same posture ingest-aptoide.yml's own 'Skip if nothing configured' step already uses).");
    return;
  }

  const [indexText, signatureText] = await Promise.all([
    fetchViaGitHubContentsApi(repo, branch, "index.json", token),
    fetchViaGitHubContentsApi(repo, branch, "index.json.sig", token),
  ]);

  if (!indexText || !signatureText) return; // already logged above; keep last good snapshot

  const candidate = await validateIndex(indexText, signatureText.trim());
  if (!candidate) {
    log("Signature/schema/freshness/rollback check failed -- keeping last good snapshot. See lib/sources/zealot.ts's validateIndex for what this collapses (bad signature, wrong schema_version, expired, or rolled back).");
    return;
  }

  const previous = await readJsonFile<RawIndex>(CACHE_FILE);
  const work = filterUnverifiedVersions(candidate, previous);
  log(`${work.length} (app, version) pair(s) need a fresh SHA-256 check this run (already-verified pairs from the last snapshot are skipped).`);

  const mismatches: string[] = [];
  for (const item of work) {
    try {
      const actual = await sha256Hex(item.url);
      if (actual !== item.claimedSha256) {
        mismatches.push(`${item.packageLabel}: index claims ${item.claimedSha256}, actual file hash is ${actual}`);
      }
    } catch (err) {
      mismatches.push(`${item.packageLabel}: could not verify (${(err as Error).message})`);
    }
  }

  if (mismatches.length > 0) {
    log(`REJECTED -- ${mismatches.length} file(s) failed SHA-256 verification, keeping last good snapshot:`);
    for (const line of mismatches) log(`  - ${line}`);
    return;
  }

  await commitIndexState(candidate);
  log(`Committed a new verified snapshot: sequence=${candidate.sequence}, generated_at=${candidate.generated_at}, ${candidate.apps.length} app(s).`);
}

main().catch((err) => {
  // A crash here must never fail the Vercel build over a snapshot refresh
  // -- same "keep the last good snapshot" posture as every other rejection
  // path above, just for the "something unexpected threw" case.
  log(`Unexpected error, keeping last good snapshot: ${(err as Error).message}`);
});
