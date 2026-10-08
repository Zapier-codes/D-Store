import type { App } from "@/lib/catalog";
import { formatAppSize } from "@/lib/app-facts";
import { usableDescription } from "@/lib/about-text";
import { isThirdParty } from "@/lib/trust";
import { AppNameTitle } from "./glass";
import AppIconLive from "./AppIconLive";
import VersionAdvisory from "./VersionAdvisory";
import InstallButton from "./InstallButton";
import ThirdPartyDownloadButton from "./ThirdPartyDownloadButton";
import ShareButton from "./ShareButton";
import FavoriteButton from "./FavoriteButton";
import styles from "./InstallCard.module.css";

/**
 * The sticky glass install card on the details page's right-hand side from 1100px: operator-directed 2026-10-08,
 * slice 6 of the rework in docs/DETAIL-PAGE-REWORK-PROMPT.md (section 5I) and docs/DETAIL-PAGE-DESIGN.md (section 3).
 *
 * Holds the icon, the name in the small treatment (the shared `AppNameTitle`, as an `<h2>`: the page's one `<h1>` is
 * the header's), the version advisory, the install button (the same `InstallButton` / `ThirdPartyDownloadButton`
 * with the same props the header gives them), Share, Save, and two quiet facts, size and version, each only when
 * the source provided it. **One sticky thing per screen:** the page hides this card below 1100px (where
 * `StickyInstallBar` is used) and hides the bar from 1100px. Install logic is untouched; this is a second
 * instance, like the bar already is, and `lib/install-status.ts` keeps all the instances in step.
 */
export default function InstallCard({ app }: { app: App }) {
  const thirdParty = isThirdParty(app);
  const size = formatAppSize(app.size_mb);
  const version = usableDescription(app.version);

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div className={styles.icon}>
          <AppIconLive
            appSlug={app.slug}
            name={app.name}
            primaryColor={app.primary_color}
            secondaryColor={app.secondary_color}
            tertiaryColor={app.tertiary_color}
            iconUrl={app.icon}
            sizes="72px"
          />
        </div>
        <AppNameTitle as="h2" className={styles.name}>
          {app.name}
        </AppNameTitle>
      </div>

      <VersionAdvisory app={app} />

      <div className={styles.install}>
        {thirdParty ? (
          <ThirdPartyDownloadButton appSlug={app.slug} appName={app.name} downloadUrl={app.apk} />
        ) : (
          <InstallButton
            appSlug={app.slug}
            appName={app.name}
            currentVersion={app.version}
            apkUrl={app.version_status === "pulled" ? "" : app.apk}
            releaseId={app.release_id}
            rolloutPercentage={app.rollout_percentage}
            packageName={app.package_name}
          />
        )}
      </div>

      <div className={styles.secondary}>
        <ShareButton appName={app.name} />
        <FavoriteButton appSlug={app.slug} appName={app.name} appIcon={app.icon} />
      </div>

      {(size || version) && (
        <dl className={styles.facts}>
          {size && (
            <div className={styles.fact}>
              <dt>Size</dt>
              <dd>{size}</dd>
            </div>
          )}
          {version && (
            <div className={styles.fact}>
              <dt>Version</dt>
              <dd>{version}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
