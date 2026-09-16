import styles from "./WavyProgressRing.module.css";

/**
 * Circular wavy/crinkled progress ring — leaf 0.j.v.zi (Play Store
 * Parity Pass).
 *
 * `InstallButton`'s own `.fill` bar (3.a.iv.zo) is a flat linear
 * progress fill inside the pill button — a reasonable stand-in, but
 * not what the real Play Store *Android app* actually shows during an
 * install/update: a ring wrapped around the app's own icon. Per a
 * September 2026 Android Authority teardown/rollout report, current
 * Play Store builds (Material 3 Expressive) replaced the old plain
 * circular progress ring around app icons with a "crinkled"
 * (scalloped/wavy-edged) ring that sweeps clockwise as the
 * download/install progresses — not a smooth circle.
 *
 * This renders that motif: a closed wavy/scalloped ring path (radius
 * gently sine-modulated around the circle — not sharp gear teeth) as
 * two overlaid `<path>`s sharing the same `pathLength={100}` (so
 * `stroke-dasharray`/`stroke-dashoffset` can work in plain 0–100
 * percentage units regardless of the path's real, harder-to-compute
 * length): a dim always-visible `.track` and a filled `.sweep` whose
 * `stroke-dashoffset` animates 100 → 0 over the same
 * `SIMULATED_INSTALL_MS` duration `InstallButton`'s own timeout uses,
 * so the ring finishes exactly when the button flips out of
 * "Installing…". A slow continuous rotation on the whole ring adds the
 * organic "curling" liquid-like motion — distinct from the
 * deterministic sweep, and gated (like the sweep) behind
 * `prefers-reduced-motion`.
 *
 * Purely decorative (`aria-hidden`) — `InstallButton`'s own
 * `aria-live` region already announces "Installing…"/"Updating…", so
 * this never needs to carry that information itself.
 */
export default function WavyProgressRing({
  active,
  durationMs,
}: {
  active: boolean;
  durationMs: number;
}) {
  if (!active) return null;

  return (
    <svg viewBox="0 0 100 100" className={styles.ring} aria-hidden="true" focusable="false">
      <path d={WAVY_RING_PATH} pathLength={100} className={styles.track} />
      <path
        d={WAVY_RING_PATH}
        pathLength={100}
        className={styles.sweep}
        style={{ animationDuration: `${durationMs}ms` }}
      />
    </svg>
  );
}

/**
 * Precomputed once at module scope (not per-render): a closed contour
 * around a 50,50 center, base radius 42, amplitude 4, 10 gentle waves
 * around the circle, sampled at 160 points and joined with straight
 * segments — dense enough sampling that it reads as a smooth wavy
 * curve rather than a faceted polygon, starting at 12 o'clock (like a
 * normal progress ring) and going clockwise.
 */
const WAVY_RING_PATH = (() => {
  const cx = 50;
  const cy = 50;
  const baseRadius = 42;
  const amplitude = 4;
  const waves = 10;
  const segments = 160;
  let d = "";
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const r = baseRadius + amplitude * Math.sin(theta * waves);
    const x = cx + r * Math.cos(theta - Math.PI / 2);
    const y = cy + r * Math.sin(theta - Math.PI / 2);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)} `;
  }
  return d + "Z";
})();
