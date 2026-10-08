import Link from "next/link";
import type { App } from "@/lib/catalog";
import { isThirdParty, isNotProvided, isVerifiedDeveloper } from "@/lib/trust";
import { reportedStatsFor } from "@/lib/third-party-stats";
import { pickHeroArt } from "@/lib/hero-card";
import { AppNameTitle, BackdropArt, GlassPill, IconRing, PillRow, Rim, Tilt } from "./glass";
import AppIconLive from "./AppIconLive";
import FirstPartyStats from "./FirstPartyStats";
import ReportedStats from "./ReportedStats";
import VersionAdvisory from "./VersionAdvisory";
import InstallButton from "./InstallButton";
import ThirdPartyDownloadButton from "./ThirdPartyDownloadButton";
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
 * (`<h1>`), the summary, the stats row (the animated counter row, replaced by the stat strip in slice 2), the
 * version advisory, size / version / Android pills, the install row, the ads and purchases line.
 *
 * **Behaviour that must stay exactly as it was** (only the look changed): the install row keeps the id
 * `primary-install-row` that `StickyInstallBar` watches; `InstallButton` and `ThirdPartyDownloadButton` get the
 * same props the page gave them; `VersionAdvisory` sits right above the install row; nothing the source did not
 * provide is printed (no "Not provided"); no source or third-party wording.
 *
 * The icon is the page's LCP candidate (`priority`). The backdrop art is a CSS background, so it never
 * competes with it.
 */
export default function AppHeader({
  app,
  developer,
  developerName,
  categoryName,
}: {
  app: App;
  developer: { slug: string; name: string } | null;
  developerName: string | null;
  categoryName: string | null;
}) {
  const thirdParty = isThirdParty(app);
  const art = pickHeroArt(app.screenshots);

  // The same soft palette glow the hero card uses when there is no screenshot art (and under it when there is).
  const glow: React.CSSProperties = {
    background: [
      `radial-gradient(ellipse 70% 100% at 0% 50%, ${app.primary_color}40, transparent 70%)`,
      `radial-gradient(ellipse 60% 100% at 100% 30%, ${app.secondary_color}30, transparent 70%)`,
    ].join(", "),
  };

  return (
    <Tilt className={styles.root}>
      <header className={styles.card} style={glow}>
        {art && <BackdropArt src={art} />}
        <Rim />

        <div className={styles.panel}>
          <div className={styles.iconWrap}>
            <IconRing />
            <div className={styles.icon}>
              <AppIconLive
                appSlug={app.slug}
                name={app.name}
                primaryColor={app.primary_color}
                secondaryColor={app.secondary_color}
                tertiaryColor={app.tertiary_color}
                iconUrl={app.icon}
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
            <p className={styles.summary}>{app.summary}</p>

            <div className={styles.stats}>
              {thirdParty ? (
                <ReportedStats stats={reportedStatsFor(app)} ratingClassName={styles.rating} mutedClassName={styles.statMuted} />
              ) : (
                // Task 45b: the store's own figures with any carried-over history folded in as one total, no label.
                <FirstPartyStats app={app} ratingClassName={styles.rating} mutedClassName={styles.statMuted} />
              )}
              {/* Shown only when the source gives a content rating; no "not provided" placeholder. */}
              {!isNotProvided(app, "content_rating") && app.content_rating && (
                <span className={styles.statMuted}>{app.content_rating}</span>
              )}
            </div>

            {/* 5.c.viii.zo: read before acting, so it sits right above the install row. Renders nothing for an available release and for every third-party app. */}
            <VersionAdvisory app={app} />

            <PillRow>
              <GlassPill>{app.size_mb.toFixed(1)} MB</GlassPill>
              <GlassPill>v{app.version}</GlassPill>
              {!isNotProvided(app, "min_android_version") && <GlassPill>Android {app.min_android_version}+</GlassPill>}
            </PillRow>

            <div className={styles.installRow} id="primary-install-row">
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
  );
}
