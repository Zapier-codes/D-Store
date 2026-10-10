import Link from "next/link";
import type { App } from "@/lib/catalog";
import type { ListingBadge } from "@/lib/play-ports";
import { installsLabelFor, rolloutLabel } from "@/lib/play-ports";
import ListingBadges from "./ListingBadges";
import { isNotProvided, isVerifiedDeveloper } from "@/lib/trust";
import { pickHeroArt } from "@/lib/hero-card";
import { AppNameTitle, BackdropArt, GlassPill, IconRing, PillRow, Rim, Tilt } from "./glass";
import AppIcon from "./AppIcon";
import StatStrip from "./StatStrip";
import DownloadControl from "./installControls";
import ShareButton from "./ShareButton";
import FavoriteButton from "./FavoriteButton";
import MonetizationDisclosure from "./MonetizationDisclosure";
import styles from "./AppHeader.module.css";

/**
 * The details page header (`/app/[slug]`): operator-directed 2026-10-08, slice 1 of the rework in
 * docs/DETAIL-PAGE-REWORK-PROMPT.md and docs/DETAIL-PAGE-DESIGN.md. It replaces the old 72px icon row with the
 * home hero card's look, built from the same shared layer (`components/glass/`): the app's first screenshot as
 * backdrop art (the palette glow when there is none), a glass panel, a big icon with the live ring, the app
 * name as 3D / frosted type, transparent pills, and a pointer tilt with the rim light (mouse only).
 *
 * What it renders, top to bottom: pills (Verified developer, Editors' pick, category, developer), the name
 * (`h1`), the summary, the install row, the ads and purchases line; and directly under
 * that glass card, the stat strip (`StatStrip`, slice 2, 2026-10-08), which replaced the old plain stats row,
 * the content-rating text and the size / version / Android pills. The strip is a sibling of the tilting card,
 * not inside it, so the pointer tilt and rim light stay on the card alone.
 *
 * **Behaviour that must stay exactly as it was** (only the look changed): the install row keeps the id
 * `primary-install-row` that `StickyInstallBar` watches; the download control is the same `DownloadControl`
 * the rest of the page uses; nothing the source did not provide is printed (no "Not provided"); no source
 * or third-party wording.
 *
 * Operator-directed 2026-10-10: a website can only download and share, so the install row is the real
 * Download control plus Share (the simulated install/progress is gone).
 *
 * The icon is the page's LCP candidate (`priority`). The backdrop art is a CSS background, so it never
 * competes with it.
 */
export default function AppHeader({
  app,
  developer,
  developerName,
  categoryName,
  badges = [],
}: {
  app: App;
  developer: { slug: string; name: string } | null;
  developerName: string | null;
  categoryName: string | null;
  /** Card D-P1 — the listing badges `badgesFor` returned; empty renders nothing. */
  badges?: ListingBadge[];
}) {
  const art = pickHeroArt(app.screenshots);
  // Card D-P2: the human install line (client `installsLabelFor`); card Z-P1: a staged-rollout note.
  const installs = installsLabelFor(app);
  const rollout = rolloutLabel(app);

  // The same soft palette glow the hero card uses when there is no screenshot art (and under it when there is).
  const glow: React.CSSProperties = {
    background: [
      `radial-gradient(ellipse 70% 100% at 0% 50%, ${app.primary_color}40, transparent 70%)`,
      `radial-gradient(ellipse 60% 100% at 100% 30%, ${app.secondary_color}30, transparent 70%)`,
    ].join(", "),
  };

  return (
    <div className={styles.wrap}>
      <Tilt className={styles.root}>
        <header className={styles.card} style={glow}>
          {art && <BackdropArt src={art} />}
          <Rim />

          <div className={styles.panel}>
            <div className={styles.iconWrap}>
              <IconRing />
              <div className={styles.icon}>
                <AppIcon
                  name={app.name}
                  primaryColor={app.primary_color}
                  secondaryColor={app.secondary_color}
                  tertiaryColor={app.tertiary_color}
                  src={app.icon}
                  sizes="160px"
                  priority
                />
              </div>
              <div className={styles.iconGlow} aria-hidden="true" style={{ background: app.primary_color }} />
            </div>

            <div className={styles.body}>
              <PillRow>
                {isVerifiedDeveloper(app) && (
                  // 5.g.iii.zi: from the signed index's verified-developer flag, never claimed for a third-party app.
                  <GlassPill variant="accent">
                    <span aria-hidden="true">✓</span> Verified developer
                  </GlassPill>
                )}
                {app.is_editors_pick && (
                  <GlassPill variant="accent">
                    <span aria-hidden="true">✦</span> Editors’ pick
                  </GlassPill>
                )}
                {categoryName && <GlassPill>{categoryName}</GlassPill>}
                {developer ? (
                  <Link href={`/developer/${developer.slug}`} className={styles.pillLink}>
                    <GlassPill>by {developer.name}</GlassPill>
                  </Link>
                ) : (
                  // 5.h.iii.zi: a third-party publisher has no /developer/[slug] page, so plain text, not a link to a 404.
                  developerName && <GlassPill>by {developerName}</GlassPill>
                )}
              </PillRow>

              <AppNameTitle as="h1" className={styles.title}>
                {app.name}
              </AppNameTitle>
              <ListingBadges badges={badges} />
              {(installs || rollout) && (
                <p className={styles.installs}>
                  {installs}
                  {installs && rollout ? " · " : ""}
                  {rollout}
                </p>
              )}
              <p className={styles.summary}>{app.summary}</p>

              <div className={styles.installRow} id="primary-install-row">
                <DownloadControl app={app} />
                <div className={styles.secondary}>
                  <ShareButton appName={app.name} />
                  <FavoriteButton appSlug={app.slug} appName={app.name} appIcon={app.icon} />
                </div>
              </div>
              <MonetizationDisclosure
                containsAds={app.contains_ads}
                hasInAppPurchases={app.has_in_app_purchases}
                notProvided={isNotProvided(app, "monetization")}
              />
            </div>
          </div>
        </header>
      </Tilt>
      <StatStrip app={app} />
    </div>
  );
}
