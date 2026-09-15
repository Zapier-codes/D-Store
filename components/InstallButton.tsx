"use client";

import { useState } from "react";
import styles from "./InstallButton.module.css";

/**
 * Dummy install button — leaf 3.a.iv.zi (Animation System →
 * Install Button, split out of `3.a.ii.zo` — see that leaf's note in
 * HANDOVER.md for why this milestone exists at all: the progress
 * animation it originally asked for had no button underneath it),
 * extended by `3.a.iv.zo` (progress-fill animation, below).
 *
 * Three states — idle / installing / installed — click-to-simulate,
 * no real APK fetch. Same "anonymous, local-state-only" dummy
 * convention `RateThisApp` (0.e.iii.zo) and `ReportAppForm`
 * (0.f.iii.zi) already use: clicking doesn't call any API — there is
 * none yet, the real download/install pipeline is Phase 5 — it just
 * drives this component's own state through a timed transition.
 *
 * `installing` drives a `setTimeout` (`SIMULATED_INSTALL_MS`) to reach
 * `installed`; `3.a.iv.zo` layers a CSS `.fill` bar underneath the
 * label that runs a matching-duration `width: 0% → 100%` animation
 * over the same window, rather than a separate `setInterval` ticking
 * a percentage in JS state — one `SIMULATED_INSTALL_MS` constant
 * literally drives both the real state transition and the visual fill,
 * so they can't drift out of sync with each other. `.fill` only
 * mounts while `state === "installing"`, so it always restarts clean
 * on the (rare, since the button disables itself) case of a second
 * click. Gated behind `@media (prefers-reduced-motion: no-preference)`
 * in `InstallButton.module.css` — the same convention `ScrollReveal`
 * (`3.a.i.zi`), the hero mount animation (`0.d.i.zo`), and the
 * `3.a.ii.zi` press states already use; a reduced-motion visitor still
 * sees the disabled/dimmed `installing` button `3.a.iv.zi` shipped,
 * just without the bar.
 *
 * Resets are intentionally not offered — like `RateThisApp`'s
 * `submitted` state, once `installed` there's no "uninstall" affordance,
 * since a real store wouldn't offer that as a client-only dummy action.
 */
const SIMULATED_INSTALL_MS = 1800;

type InstallState = "idle" | "installing" | "installed";

export default function InstallButton({ appName }: { appName: string }) {
  const [state, setState] = useState<InstallState>("idle");

  function handleClick() {
    if (state !== "idle") return;
    setState("installing");
    setTimeout(() => setState("installed"), SIMULATED_INSTALL_MS);
  }

  const label =
    state === "idle" ? "Install" : state === "installing" ? "Installing…" : "Installed";

  return (
    <button
      type="button"
      className={styles.button}
      data-state={state}
      disabled={state !== "idle"}
      aria-live="polite"
      aria-label={`${label} ${appName}`}
      onClick={handleClick}
    >
      {state === "installing" && (
        <span
          className={styles.fill}
          aria-hidden="true"
          style={{ animationDuration: `${SIMULATED_INSTALL_MS}ms` }}
        />
      )}
      <span className={styles.label}>
        {state === "installed" && (
          <span className={styles.check} aria-hidden="true">
            ✓
          </span>
        )}
        {label}
      </span>
    </button>
  );
}
