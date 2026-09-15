"use client";

import { useState } from "react";
import styles from "./InstallButton.module.css";

/**
 * Dummy install button — leaf 3.a.iv.zi (Animation System →
 * Install Button, split out of `3.a.ii.zo` — see that leaf's note in
 * HANDOVER.md for why this milestone exists at all: the progress
 * animation it originally asked for had no button underneath it),
 * extended by `3.a.iv.zo` (progress-fill animation) and now `0.j.i.zo`
 * (Play Store Parity Pass — post-install state).
 *
 * Four states — idle / installing / installed / (installed →) open —
 * click-to-simulate, no real APK fetch. Same "anonymous,
 * local-state-only" dummy convention `RateThisApp` (0.e.iii.zo) and
 * `ReportAppForm` (0.f.iii.zi) already use: clicking doesn't call any
 * API — there is none yet, the real download/install pipeline is
 * Phase 5 — it just drives this component's own state.
 *
 * `installing` drives a `setTimeout` (`SIMULATED_INSTALL_MS`) to reach
 * `installed`; `3.a.iv.zo`'s CSS `.fill` bar (unchanged by this leaf)
 * still runs underneath that transition. Gated behind
 * `@media (prefers-reduced-motion: no-preference)` in
 * `InstallButton.module.css` — the same convention `ScrollReveal`
 * (`3.a.i.zi`), the hero mount animation (`0.d.i.zo`), and the
 * `3.a.ii.zi` press states already use.
 *
 * `0.j.i.zo` replaces the old dead-end: `installed` used to render a
 * disabled checkmark-only pill with no way out (see HANDOVER.md's
 * "Play Store Parity Pass" note — real Play swaps to an **Open**
 * primary action with **Uninstall** reachable from the same control,
 * not a inert end state). This now renders a primary "Open" pill
 * (`.button`, same shape as `idle`'s "Install" pill, matching Play's
 * pattern of Open being the *next* primary action, not a disabled
 * state) plus a secondary "Uninstall" pill next to it — the "secondary
 * action" option HANDOVER.md's leaf note offers as an alternative to
 * an overflow menu; a second always-visible button is simpler than
 * introducing a client-side menu-open state for one item, and stays
 * consistent with this codebase's general preference for the plainest
 * interaction that satisfies the requirement.
 *
 * "Open" has nothing real to launch (there's no installed APK — this
 * is still the click-to-simulate dummy convention noted above), so its
 * click handler is intentionally a no-op; it's rendered as a real
 * `<button>` (not a disabled placeholder) purely so it reads as the
 * correct *next* primary action per Play's pattern, matching the
 * leaf's requirement that `installed` no longer be a dead end even
 * though "launch a dummy app" isn't a real operation to perform.
 * "Uninstall" is the actual state transition this leaf adds: it resets
 * back to `idle`, so a visitor can replay the install flow instead of
 * hitting a permanent end state.
 */
const SIMULATED_INSTALL_MS = 1800;

type InstallState = "idle" | "installing" | "installed";

export default function InstallButton({ appName }: { appName: string }) {
  const [state, setState] = useState<InstallState>("idle");

  function handleInstallClick() {
    if (state !== "idle") return;
    setState("installing");
    setTimeout(() => setState("installed"), SIMULATED_INSTALL_MS);
  }

  function handleUninstallClick() {
    setState("idle");
  }

  if (state === "installed") {
    return (
      <span className={styles.group} aria-live="polite">
        <button
          type="button"
          className={styles.button}
          data-state="open"
          aria-label={`Open ${appName}`}
        >
          Open
        </button>
        <button
          type="button"
          className={styles.uninstallButton}
          aria-label={`Uninstall ${appName}`}
          onClick={handleUninstallClick}
        >
          Uninstall
        </button>
      </span>
    );
  }

  const label = state === "idle" ? "Install" : "Installing…";

  return (
    <button
      type="button"
      className={styles.button}
      data-state={state}
      disabled={state !== "idle"}
      aria-live="polite"
      aria-label={`${label} ${appName}`}
      onClick={handleInstallClick}
    >
      {state === "installing" && (
        <span
          className={styles.fill}
          aria-hidden="true"
          style={{ animationDuration: `${SIMULATED_INSTALL_MS}ms` }}
        />
      )}
      <span className={styles.label}>{label}</span>
    </button>
  );
}
