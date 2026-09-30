import type { App } from "@/lib/catalog";
import { decideAdvisory } from "@/lib/version-advisory";
import styles from "./VersionAdvisory.module.css";

/**
 * Version advisory banner — leaf `5.c.viii.zi` (split out of `5.c.iii.zo`).
 *
 * Pure server component: no state, no client code. Tells a visitor that the
 * publisher has paused (`halted`) or withdrawn (`pulled`) the newest release
 * of a first-party app. It renders nothing otherwise: an `available` release,
 * an app with no `version_status` (every third-party app, whose source has no
 * such status) and any value the decision helper does not recognise all
 * produce no banner.
 *
 * Driven by `app.version_status` only — the release's lifecycle — and never by
 * `rollout_status`, the staged-rollout ramp: a rollout paused at 30% is not an
 * advisory. The text comes from `decideAdvisory`, which states the status and
 * gives no cause (the index carries none).
 *
 * The state is written as text (the title) as well as styled, so it never
 * depends on colour alone. `pulled` is `role="alert"`, `halted` is
 * `role="status"`. The shell (padding, border, radius, surface) is the
 * always-visible callout `PlayStoreDisclosure` and `DataSafety` use.
 *
 * Not mounted on any page yet (`5.c.viii.zo`).
 */
export default function VersionAdvisory({ app }: { app: App }) {
  const advisory = decideAdvisory(app.version_status ?? "available", app.version);
  if (advisory === null) return null;

  const kindClass = advisory.kind === "pulled" ? styles.pulled : styles.halted;

  return (
    <div className={`${styles.wrapper} ${kindClass}`} role={advisory.kind === "pulled" ? "alert" : "status"}>
      <span className={styles.title}>{advisory.title}</span>
      <p className={styles.message}>{advisory.message}</p>
    </div>
  );
}
