/**
 * Pure helpers for the downloads count-up animation (CountUp component).
 * Display only: the stored number is never changed.
 */

/** Ease-out cubic: fast at the start, slowing into the final value. Input and output are clamped to 0..1. */
export function easeOutCubic(progress: number): number {
  if (!Number.isFinite(progress) || progress <= 0) return 0;
  if (progress >= 1) return 1;
  return 1 - Math.pow(1 - progress, 3);
}

/** The whole number to show `progress` (0..1) of the way to `target`. Never exceeds `target`, never negative. */
export function countUpValue(target: number, progress: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  const value = Math.floor(target * easeOutCubic(progress));
  return Math.min(Math.max(value, 0), Math.floor(target));
}
