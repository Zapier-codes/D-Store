/**
 * Staged-rollout device bucketing — leaf `5.c.iv.zo`.
 *
 * Zealot's `30f` (`Release#rollout_includes_device?`) decides, per
 * device, whether a given release is offered yet: deterministic,
 * sha256-based bucketing so the same device always lands in the same
 * bucket for a given release, and raising the percentage only ever adds
 * devices in, never removes one already included. That decision has to
 * be re-derived here, not read off the index — the signed index (this
 * repo's `lib/sources/zealot.ts`, `5.c.iv.zo`) is published once per
 * change with no per-device context, so it can only ever describe a
 * rollout ("35% of installs, active"), never evaluate it for one
 * specific browser. This module is the "whichever layer knows the
 * requesting device" that `CatalogIndex::Serializer#rollout_for`'s own
 * comment on the Zealot side already pointed at.
 *
 * The algorithm here is a deliberate line-for-line port of Zealot's
 * `Release#rollout_includes_device?`
 * (`bucket = sha256("<device_id>:<release_id>")` first 8 bytes as a
 * big-endian uint64, mod 100; included if `bucket < percentage`) — NOT a
 * new design. A different algorithm here would silently disagree with
 * the server's own notion of who's "in," which defeats the entire
 * point: this repo has no way to ask Zealot "is this device in yet,"
 * since Zealot never sees a stable per-device identifier for a website
 * visitor (there's no install, no app-level device registration here —
 * see `lib/install-status.ts`'s own header for the general reason a
 * website can't do real OS-level device attestation). So the same
 * computation has to run independently on both sides and agree by
 * construction, not by coordination.
 */

const STORAGE_KEY = "d-store:device-id";

/**
 * A stable per-browser id, generated once and persisted the same
 * `localStorage`, fail-soft way `lib/install-status.ts` already treats
 * every device-local record — this is that same "device," reused as the
 * one stable identifier a rollout bucket needs, rather than inventing a
 * second one. `crypto.randomUUID()` is available in every browser this
 * app already requires for `crypto.subtle` (below); no separate
 * polyfill.
 */
export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, generated);
    return generated;
  } catch {
    // Storage disabled/unavailable (private browsing, quota, etc.) --
    // same fail-soft posture lib/install-status.ts already uses. No
    // device id means no rollout decision can be made; callers treat
    // `null` as "not resolvable," never as "assume included."
    return null;
  }
}

/**
 * `bucket < percentage` -- deliberately the exact same comparison
 * Zealot's own `Release#rollout_includes_device?` makes, not
 * `<=`/rounded/inverted. `percentage <= 0` and `>= 100` are short-
 * circuited the same way the Ruby method short-circuits them, both for
 * the trivial cases and so a percentage outside 0-100 (which shouldn't
 * happen -- the DB check constraint on the Zealot side already
 * enforces the range -- but this reads a signed index over the network,
 * not the database directly) still resolves to an honest boolean
 * instead of a bucket comparison against an out-of-range number.
 */
export async function isDeviceInRollout(
  deviceId: string,
  releaseId: string,
  percentage: number,
): Promise<boolean> {
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;

  const encoded = new TextEncoder().encode(`${deviceId}:${releaseId}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const view = new DataView(digest);
  // First 8 bytes, big-endian, as a bucket source -- same slice
  // `Release#rollout_includes_device?` takes (`byteslice(0, 8)`,
  // `unpack1('Q>')`). DataView has no native uint64 read, so this reads
  // two big-endian uint32 halves and combines them with BigInt, which
  // is exact for this purpose (only the value mod 100 is ever used, so
  // there's no precision concern from JS's usual float-safe-integer
  // limits the way there would be if the raw 64-bit value were used
  // directly for anything else).
  const high = BigInt(view.getUint32(0, false));
  const low = BigInt(view.getUint32(4, false));
  const combined = (high << BigInt(32)) | low;
  const bucket = Number(combined % BigInt(100));
  return bucket < percentage;
}
