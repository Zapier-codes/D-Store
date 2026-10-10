import type { App } from "./mock-data";
import { combinedDownloadTotal, combinedRating, formatDownloadCount } from "./carried-over-stats";
import { updatedLabel } from "./hero-card";
import { formatReportedDownloads, reportedStatsFor } from "./third-party-stats";
import { isNotProvided, isThirdParty } from "./trust";

/**
 * Pure helpers behind the details page's stat strip and Information list (operator-directed 2026-10-08, slice 2
 * of the rework in docs/DETAIL-PAGE-REWORK-PROMPT.md, sections 5B and 5D). No I/O, no React; the components
 * (`StatStrip`, `AppInformation`) only draw what these return.
 *
 * The one rule for everything here: a fact is returned only when the source provided it. Nothing is
 * invented, nothing is estimated, and no value reads "Not provided" (a field the source left out gives no
 * tile and no row). No source name and no third-party wording either: third-party figures come out of
 * `reportedStatsFor` and look exactly like first-party ones.
 */

/** The fields these helpers read; a plain `App` satisfies it, and tests can pass a small object. */
export type FactsApp = Pick<
  App,
  | "origin"
  | "not_provided"
  | "base_stats"
  | "install_count"
  | "avg_rating"
  | "rating_count"
  | "third_party_stats"
  | "content_rating"
  | "size_mb"
  | "version"
  | "updated_at"
  | "min_android_version"
  | "license"
  | "device_compat"
>;

/** How a counting figure is written: `short` is 5.8M, `exact` is 1,234, `reported` is a lower bound such as 5M+. */
export type CounterVariant = "short" | "exact" | "reported";

export type StatTileId = "downloads" | "rating" | "age" | "size" | "version" | "android";

export interface StatTile {
  id: StatTileId;
  /** The big figure as final text. For a counting tile it equals what `CountUp` settles on. */
  value: string;
  /** The small caption under the figure. For the rating tile it is the count ("1,234 ratings"). */
  label: string;
  /** An optional third line (the version tile's updated date). */
  note?: string;
  /** Present when the figure counts up on scroll; `value` is its final text. */
  counter?: { target: number; variant: CounterVariant; suffix: string };
  /** Present on the rating tile: the average the fractional star meter is filled from. */
  rating?: { average: number };
}

export interface InfoRow {
  id: "developer" | "category" | "size" | "version" | "updated" | "android" | "license" | "content_rating";
  label: string;
  value: string;
  /** A same-site link for the value (the developer's page); absent for plain text. */
  href?: string;
}

/** Text the source left empty or marked as missing; the placeholder `"Not provided"` is the repo's own marker. */
function usableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0) return null;
  if (text.toLowerCase() === "not provided") return null;
  return text;
}

/** "12.3 MB", "1.5 GB", "512 KB"; `null` for a size that is missing, zero, negative or not a number. */
export function formatAppSize(mb: number | null | undefined): string | null {
  if (typeof mb !== "number" || !Number.isFinite(mb) || mb <= 0) return null;
  const rounded = Math.round(mb * 10) / 10;
  if (rounded >= 1024) return `${(Math.round((mb / 1024) * 10) / 10).toFixed(1)} GB`;
  if (mb < 1) return `${Math.max(1, Math.round(mb * 1024))} KB`;
  return `${rounded.toFixed(1)} MB`;
}

/** "Oct 8, 2026" from an ISO date, in UTC so the server and the browser agree; `null` when missing or invalid. */
export function formatFactDate(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The content rating the source gave, or `null` (flagged not provided, empty, or the placeholder). */
export function usableContentRating(app: Pick<App, "not_provided" | "content_rating">): string | null {
  if (isNotProvided(app, "content_rating")) return null;
  return usableText(app.content_rating);
}

/** The licence the source gave, or `null`. */
export function usableLicense(app: Pick<App, "license">): string | null {
  return usableText(app.license);
}

/**
 * The minimum Android requirement the source gave, in two spellings: `short` for a tile ("8.0+") and `long`
 * for a list row ("Android 8.0 and up"). A version number gets the word Android in the long form; an API level
 * such as "API 31" (what the first-party index reports) is left as written. `null` when not provided.
 */
export function minAndroidFor(app: Pick<App, "not_provided" | "min_android_version">): { short: string; long: string } | null {
  if (isNotProvided(app, "min_android_version")) return null;
  const value = usableText(app.min_android_version);
  if (value === null) return null;
  const long = /^\d/.test(value) ? `Android ${value} and up` : `${value} and up`;
  return { short: `${value}+`, long };
}

function ratingsLabel(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "rating" : "ratings"}`;
}

function downloadsTile(app: FactsApp): StatTile | null {
  if (isThirdParty(app)) {
    const downloads = reportedStatsFor(app)?.downloads ?? null;
    if (downloads === null || !Number.isFinite(downloads) || downloads <= 0) return null;
    return {
      id: "downloads",
      value: formatReportedDownloads(downloads),
      label: "Downloads",
      counter: { target: downloads, variant: "reported", suffix: "" },
    };
  }
  // First party: the carried-over total alone when there is one (it already includes this store's own count,
  // see combinedDownloadTotal), else this store's own install count. A count of zero is not shown.
  const combined = combinedDownloadTotal(app);
  if (combined !== null && combined > 0) {
    return {
      id: "downloads",
      value: formatDownloadCount(combined),
      label: "Downloads",
      counter: { target: combined, variant: "short", suffix: "" },
    };
  }
  const own = Number.isFinite(app.install_count) ? Math.floor(app.install_count) : 0;
  if (own <= 0) return null;
  return {
    id: "downloads",
    value: `${own.toLocaleString("en-US")}+`,
    label: "Downloads",
    counter: { target: own, variant: "exact", suffix: "+" },
  };
}

function ratingTile(app: FactsApp): StatTile | null {
  let average: number;
  let count: number;
  if (isThirdParty(app)) {
    const rating = reportedStatsFor(app)?.rating ?? null;
    if (rating === null) return null;
    average = rating.average;
    count = rating.total;
  } else {
    const combined = combinedRating(app);
    average = combined?.average ?? app.avg_rating;
    count = combined?.count ?? app.rating_count;
  }
  if (!Number.isFinite(average) || !Number.isFinite(count) || average <= 0 || count <= 0) return null;
  const whole = Math.floor(count);
  return {
    id: "rating",
    value: average.toFixed(1),
    label: ratingsLabel(whole),
    rating: { average },
  };
}

/**
 * Card S-P2 (web reader) — "works on your device": given the device's Android API level and ABI (read by
 * `lib/device.ts` from the browser/UA on the client, or left empty when unknown), decide whether the app's
 * published `device_compat` says it can run here. The verdict is deliberately three-valued and conservative:
 *   - `"yes"`  — the app published its constraints and the device meets every one of them;
 *   - `"no"`   — the app published a constraint the device fails (API level below `min_sdk`, or no shared ABI);
 *   - `"unknown"` — the app published nothing (or too little) to decide, or the device did not say.
 * An app with no `device_compat` is `"unknown"`, never `"yes"` — this store does not claim compatibility the
 * source never asserted. A device API level of `null` can still fail on ABI, and vice versa.
 */
export type DeviceFit = "yes" | "no" | "unknown";

export interface DeviceProfile {
  /** The device's Android API level (e.g. 34), or `null` when unknown. */
  apiLevel: number | null;
  /** The device's primary ABI (e.g. `"arm64-v8a"`), or `null` when unknown. */
  abi: string | null;
}

export function deviceFits(
  app: Pick<FactsApp, "device_compat">,
  device: DeviceProfile,
): DeviceFit {
  const compat = app.device_compat;
  if (!compat) return "unknown";
  let saidSomething = false;

  // An API-level constraint the device cannot be checked against yields "unknown", not a guess.
  const minSdk = compat.min_sdk;
  if (Number.isFinite(minSdk) && (minSdk as number) > 0) {
    if (device.apiLevel === null) return "unknown";
    saidSomething = true;
    if (device.apiLevel < (minSdk as number)) return "no";
  }

  const abis = compat.abis;
  if (Array.isArray(abis) && abis.length > 0) {
    saidSomething = true;
    if (device.abi !== null && !abis.includes(device.abi)) return "no";
  }

  return saidSomething ? "yes" : "unknown";
}

/**
 * The tiles of the stat strip, in order: Downloads, Rating, Age rating, Size, Version (with its updated date),
 * Compatibility. A tile is returned only when the source provided its value; an app with nothing at all gets
 * an empty list and the strip renders nothing.
 */
export function statTilesFor(app: FactsApp): StatTile[] {
  const tiles: StatTile[] = [];

  const downloads = downloadsTile(app);
  if (downloads) tiles.push(downloads);

  const rating = ratingTile(app);
  if (rating) tiles.push(rating);

  const age = usableContentRating(app);
  if (age !== null) tiles.push({ id: "age", value: age, label: "Age rating" });

  const size = formatAppSize(app.size_mb);
  if (size !== null) tiles.push({ id: "size", value: size, label: "Size" });

  const version = usableText(app.version);
  if (version !== null) {
    const tile: StatTile = { id: "version", value: version, label: "Version" };
    const updated = updatedLabel(app.updated_at);
    if (updated !== null) tile.note = updated;
    tiles.push(tile);
  }

  const android = minAndroidFor(app);
  if (android !== null) tiles.push({ id: "android", value: android.short, label: "Requires Android" });

  return tiles;
}

/**
 * Card D-P5 — the Data Safety panel rows, from the `data_safety` the source supplied. Play's form claims
 * four things; this renders each only when the source provided the section at all (`provided !== false`),
 * and reads a "no" honestly (a field left `false` is a fact, not a gap, exactly as `PermissionsDisclosure`
 * treats its neighbouring data). An app whose source has no such section (`provided === false`) returns an
 * empty list, so the page draws no panel rather than an invented one.
 */
export interface DataSafetyRow {
  question: string;
  answer: string;
}

const DATA_TYPE_LIST_LIMIT = 6;

export function dataSafetyRowsFor(
  app: Pick<App, "data_safety">,
): DataSafetyRow[] {
  const safety = app.data_safety;
  if (safety.provided === false) return [];

  const rows: DataSafetyRow[] = [];
  rows.push({
    question: "Data collected",
    answer: safety.collects_data ? "Yes" : "No",
  });
  if (safety.collects_data && safety.data_types.length > 0) {
    const shown = safety.data_types.slice(0, DATA_TYPE_LIST_LIMIT);
    const more = safety.data_types.length - shown.length;
    rows.push({
      question: "Data types",
      answer: shown.join(", ") + (more > 0 ? `, and ${more} more` : ""),
    });
  }
  rows.push({ question: "Shared with third parties", answer: safety.shared_with_third_parties ? "Yes" : "No" });
  rows.push({ question: "Data encrypted in transit", answer: safety.data_encrypted_in_transit ? "Yes" : "No" });
  rows.push({ question: "You can request data deletion", answer: safety.can_request_data_deletion ? "Yes" : "No" });
  return rows;
}

/**
 * The rows of the Information list, in order: Developer, Category, Size, Version, Updated, Requires Android,
 * License, Content rating. Only rows the source provided are returned; there is never a placeholder row.
 * `context` carries what the page already looked up (the developer record, the category's display name).
 */
export function infoRowsFor(
  app: FactsApp,
  context: {
    developer: { slug: string; name: string } | null;
    developerName: string | null;
    categoryName: string | null;
  },
): InfoRow[] {
  const rows: InfoRow[] = [];

  const developerName = usableText(context.developer?.name) ?? usableText(context.developerName);
  if (developerName !== null) {
    const row: InfoRow = { id: "developer", label: "Developer", value: developerName };
    if (context.developer && usableText(context.developer.name) !== null) row.href = `/developer/${context.developer.slug}`;
    rows.push(row);
  }

  const category = usableText(context.categoryName);
  if (category !== null) rows.push({ id: "category", label: "Category", value: category });

  const size = formatAppSize(app.size_mb);
  if (size !== null) rows.push({ id: "size", label: "Size", value: size });

  const version = usableText(app.version);
  if (version !== null) rows.push({ id: "version", label: "Version", value: version });

  const updated = formatFactDate(app.updated_at);
  if (updated !== null) rows.push({ id: "updated", label: "Updated", value: updated });

  const android = minAndroidFor(app);
  if (android !== null) rows.push({ id: "android", label: "Requires Android", value: android.long });

  const license = usableLicense(app);
  if (license !== null) rows.push({ id: "license", label: "License", value: license });

  const rating = usableContentRating(app);
  if (rating !== null) rows.push({ id: "content_rating", label: "Content rating", value: rating });

  return rows;
}
