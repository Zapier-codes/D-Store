"use client";

import { useState } from "react";
import styles from "./InstallButton.module.css";

/**
 * Dummy install button — leaf 3.a.iv.zi (Animation System →
 * Install Button, split out of `3.a.ii.zo` — see that leaf's note in
 * HANDOVER.md for why this milestone exists at all: the progress
 * animation it originally asked for had no button underneath it).
 *
 * Three states — idle / installing / installed — click-to-simulate,
 * no real APK fetch. Same "anonymous, local-state-only" dummy
 * convention `RateThisApp` (0.e.iii.zo) and `ReportAppForm`
 * (0.f.iii.zi) already use: clicking doesn't call any API — there is
 * none yet, the real download/install pipeline is Phase 5 — it just
 * drives this component's own state through a timed transition.
 *
 * `installing` uses a flat `setTimeout` (`SIMULATED_INSTALL_MS`) to
 * reach `installed`, not an animated fill — the progress-fill
 * animation is explicitly `3.a.iv.zo`'s scope, not this leaf's, per
 * the same "utility this leaf, animate it next leaf" split
 * `ScrollReveal` (`3.a.i.zi`/`zo`) already used. The installing state
 * is still visually distinct (disabled, dimmed, "Installing…" label)
 * so the three states read clearly today; `3.a.iv.zo` fills the bar,
 * it doesn't add a state.
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
      {state === "installed" && (
        <span className={styles.check} aria-hidden="true">
          ✓
        </span>
      )}
      {label}
    </button>
  );
}
