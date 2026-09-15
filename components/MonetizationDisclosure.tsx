import styles from "./MonetizationDisclosure.module.css";

/**
 * Monetization disclosure — leaf 0.j.iv.zi (Play Store Parity Pass,
 * disclosure gaps). Renders "Contains ads" / "In-app purchases" near
 * the Install button, sourced from the new `contains_ads`/
 * `has_in_app_purchases` fields on `App` (`lib/mock-data.ts`) —
 * distinct from D-Store's own shelf-level Sponsored cards (Section
 * 4A of docs/D-STORE.md), which are house ads at the shelf level, not
 * a per-app third-party ad SDK this component is about.
 *
 * Matches real Play Store behavior: renders nothing when an app has
 * neither, rather than an explicit "No ads" tag — Play doesn't show a
 * reassurance tag for the common case, only a disclosure tag for the
 * cases that need disclosing. On this catalog every app has both
 * fields `false` (see the field comment on `App` for why that's the
 * honest value, not an oversight), so in the live app this component
 * renders `null` everywhere — the correct outcome, not a bug.
 *
 * Because no real catalog entry can honestly exercise the
 * "renders something" branch, that branch was verified separately —
 * outside the live app, with fabricated `true` props, via
 * `react-dom/server`'s `renderToStaticMarkup` — rather than left
 * unverified. See this leaf's HANDOVER.md entry for the exact output
 * that check produced.
 */
export default function MonetizationDisclosure({
  containsAds,
  hasInAppPurchases,
}: {
  containsAds: boolean;
  hasInAppPurchases: boolean;
}) {
  if (!containsAds && !hasInAppPurchases) {
    return null;
  }

  const labels = [
    containsAds ? "Contains ads" : null,
    hasInAppPurchases ? "In-app purchases" : null,
  ].filter((label): label is string => label !== null);

  return <p className={styles.line}>{labels.join(" \u00B7 ")}</p>;
}
