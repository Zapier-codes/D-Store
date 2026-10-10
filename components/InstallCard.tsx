import type { App } from "@/lib/catalog";
import { formatAppSize } from "@/lib/app-facts";
import { usableDescription } from "@/lib/about-text";
import { AppNameTitle } from "./glass";
import AppIcon from "./AppIcon";
import DownloadControl from "./installControls";
import ShareButton from "./ShareButton";
import FavoriteButton from "./FavoriteButton";
import styles from "./InstallCard.module.css";

/**
 * The sticky glass install card on the details page's right-hand side from 1100px: operator-directed 2026-10-08,
 * slice 6 of the rework in docs/DETAIL-PAGE-REWORK-PROMPT.md (section 5I) and docs/DETAIL-PAGE-DESIGN.md (section 3).
 *
 * Holds the icon, the name in the small treatment (the shared `AppNameTitle`, as an `<h2>`), the download control
 * (the same `DownloadControl` the header uses), Share, Save, and two quiet facts, size and version, each only when
 * the source provided it. **One sticky thing per screen:** the page hides this card below 1100px (where
 * `StickyInstallBar` is used) and hides the bar from 1100px.
 *
 * Operator-directed 2026-10-10: a website can only download and share, so the card is Download + Share + Save; the
 * version advisory banner and the simulated install state are gone.
 */
export default function InstallCard({ app }: { app: App }) {
  const size = formatAppSize(app.size_mb);
  const version = usableDescription(app.version);

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div className={styles.icon}>
          <AppIcon
            name={app.name}
            primaryColor={app.primary_color}
            secondaryColor={app.secondary_color}
            tertiaryColor={app.tertiary_color}
            src={app.icon}
            sizes="72px"
          />
        </div>
        <AppNameTitle as="h2" className={styles.name}>
          {app.name}
        </AppNameTitle>
      </div>

      <div className={styles.install}>
        <DownloadControl app={app} />
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
