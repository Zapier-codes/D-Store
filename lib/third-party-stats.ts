import type { App, ThirdPartyStats } from "./mock-data";
import { isThirdParty } from "./trust";

/**
 * Display helpers for a third-party source's own rating and download figure —
 * leaf `5.h.vii.zo`. Pure; nothing here touches this store's own counters
 * (`install_count`, `avg_rating`, `rating_count`).
 */

/**
 * The source's reported stats for `app`, or `null` for a first-party app (which
 * never shows them, whatever the field holds) and for a third-party app whose
 * response carried none.
 */
export function reportedStatsFor(app: Pick<App, "origin" | "third_party_stats">): ThirdPartyStats | null {
  return isThirdParty(app) ? (app.third_party_stats ?? null) : null;
}

/**
 * A reported download figure as a lower bound: `2000000000` -> `2B+`,
 * `500000000` -> `500M+`, `1500000` -> `1.5M+`, `750` -> `750+`, `0` -> `0`.
 * Rounds down to one decimal place, so it never claims more than was reported.
 * A non-finite or negative input gives `0` (never throws).
 */
export function formatReportedDownloads(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "0";
  const scaled = (value: number, unit: string) => `${Math.floor(value * 10) / 10}${unit}+`;
  if (count >= 1e9) return scaled(count / 1e9, "B");
  if (count >= 1e6) return scaled(count / 1e6, "M");
  if (count >= 1e3) return scaled(count / 1e3, "K");
  return `${Math.floor(count)}+`;
}
