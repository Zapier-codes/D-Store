import { notFound } from "next/navigation";
import Link from "next/link";
import { getAppBySlug, getSimilarApps, getDeveloperBySlug, getCategoryBySlug } from "@/lib/catalog";
import { getTheme } from "@/lib/theme";
import CategoryThemeScope from "@/components/CategoryThemeScope";
import ScreenshotCarousel from "@/components/ScreenshotCarousel";
import ExpandableDescription from "@/components/ExpandableDescription";
import Changelog from "@/components/Changelog";
import RatingSummary from "@/components/RatingSummary";
import RateThisApp from "@/components/RateThisApp";
import ChecksumDisplay from "@/components/ChecksumDisplay";
import SignatureInfo from "@/components/SignatureInfo";
import PlayStoreDisclosure from "@/components/PlayStoreDisclosure";
import PermissionsDisclosure from "@/components/PermissionsDisclosure";
import DataSafety from "@/components/DataSafety";
import ReportAppForm from "@/components/ReportAppForm";
import InstallButton from "@/components/InstallButton";
import MonetizationDisclosure from "@/components/MonetizationDisclosure";
import StickyInstallBar from "@/components/StickyInstallBar";
import AppIconLive from "@/components/AppIconLive";
import Shelf from "@/components/Shelf";
import AppStructuredData from "@/components/AppStructuredData";
import ViewPing from "@/components/ViewPing";
import styles from "./page.module.css";

/**
 * App detail page — leaf 0.e.i.zi (App Detail Page → Media → Screenshot
 * carousel), extended by 0.e.i.zo (lightbox), 0.e.ii.zi (expandable
 * description), 0.e.ii.zo (What's New changelog), 0.e.iii.zi (rating
 * stars + histogram), 0.e.iii.zo (anonymous rating submission),
 * 0.f.i.zi (SHA-256 checksum), 0.f.i.zo (digital signature info),
 * 0.f.ii.zi ("Why not on Play Store" disclosure), 0.f.ii.zo
 * (permissions disclosure), 0.f.iii.zi (anonymous "Report app" form),
 * 0.g.iii.zi (similar-apps rail), 0.g.iii.zo (developer credit link),
 * 0.j.i.zi (header trust-signal stats row — rating/reviews/installs/
 * Editors' Choice, plus size/version/min-Android next to the Install
 * button — see HANDOVER.md's "Play Store Parity Pass" note for why
 * this page's own header was thinner on these signals than the home
 * page's `Hero` already is for the same app), and now 0.j.iii.zi
 * (content/age rating, e.g. "Everyone", added to the same stats row
 * next to the star rating — the `0.j.iii` audit note's first finding:
 * a real Play Store trust signal this repo had nowhere in its data
 * model at all until this leaf), and now 0.j.iii.zo ("Data Safety"
 * section — what data the app collects and whether it's shared,
 * distinct from Permissions above; the audit note's second finding).
 * This is the route
 * `/app/[slug]` itself (created by 0.e.i.zi) — every card/hero link
 * built so far (AppCard 0.c.ii.zo, Hero 0.d.i.zi) has pointed here as
 * a forward reference.
 *
 * The similar-apps rail reuses `Shelf` (0.d.ii.zi) directly, unlike
 * every other section on this page (which use a plain `<section>` +
 * `<h2>` wrapper) — `Shelf` already renders nothing when its `apps`
 * array is empty, which is exactly right here (an app that's the only
 * one in its category, e.g. `system`'s lone F-Droid entry, shouldn't
 * show an empty "Similar Apps" rail), so there's no need to duplicate
 * that empty-check the way the Permissions/Report sections do for
 * their own different reasons.
 *
 * `0.e`, `0.f` (Trust & Safety UI), and now `0.g.iii` (Related content)
 * are complete for this page. `0.g.iii.zo`'s actual profile page lands
 * on a new route, `/developer/[slug]`, not here — this file's only
 * change for that leaf is the "by {developer}" credit link in the
 * header below, which is what makes that new route reachable at all.
 *
 * Also renders `AppStructuredData` (`2.d.iii.zo`, Legal & Compliance,
 * SEO) — a `<script type="application/ld+json">` tag, not a visible
 * section, so it has no header/`<section>` of its own the way every
 * leaf above does. Needs the category's display name (not just
 * `app.category`'s slug), so this is the first fetch on this page to
 * call `getCategoryBySlug` alongside the existing `getDeveloperBySlug`
 * lookup.
 *
 * `<main>` is now wrapped in `CategoryThemeScope` (`0.i.ii.zo`), which
 * re-skins this page's own accent/gradient when `app.category` has a
 * register (`lib/category-theme.ts`) and does nothing (no wrapper
 * element) when it doesn't — see that component's header comment for
 * why wrapping only `<main>` is what keeps this from ever touching the
 * global `Header`/`Footer` in `app/layout.tsx`.
 *
 * Dynamic route (`notFound()` on an unknown slug) — no
 * `generateStaticParams` yet since the whole catalog is still an
 * in-memory dummy array (`lib/mock-data.ts`) that can change shape
 * before Phase 5 wires in real data; static generation is a later
 * concern, not a Phase 0 one.
 */
export default async function AppDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const app = await getAppBySlug(slug);

  if (!app) {
    notFound();
  }

  const similarApps = await getSimilarApps(app.slug);
  const developer = await getDeveloperBySlug(app.developer_slug);
  const category = await getCategoryBySlug(app.category);
  const mode = await getTheme();

  return (
    <CategoryThemeScope categorySlug={app.category} mode={mode}>
      <main className={styles.main}>
        <ViewPing appSlug={app.slug} />
        <AppStructuredData
          app={app}
          categoryName={category?.name ?? null}
          developerName={developer?.name ?? null}
        />
        <header className={styles.header}>
          <div className={styles.icon}>
            <AppIconLive
              appSlug={app.slug}
              name={app.name}
              primaryColor={app.primary_color}
              secondaryColor={app.secondary_color}
              tertiaryColor={app.tertiary_color}
            />
          </div>
          <div>
            <h1 className={styles.name}>{app.name}</h1>
            <p className={styles.summary}>{app.summary}</p>
            {developer && (
              <Link href={`/developer/${developer.slug}`} className={styles.developerLink}>
                by {developer.name}
              </Link>
            )}

            <div className={styles.stats}>
              <span className={styles.rating}>
                <span aria-hidden="true">★</span> {app.avg_rating.toFixed(1)}
                <span className={styles.statMuted}> ({app.rating_count.toLocaleString()})</span>
              </span>
              <span className={styles.statMuted}>{app.content_rating}</span>
              <span className={styles.statMuted}>{app.install_count.toLocaleString()}+ installs</span>
              {app.is_editors_pick && <span className={styles.badge}>Editors&rsquo; Pick</span>}
            </div>

            <div className={styles.installRow} id="primary-install-row">
              <InstallButton
                appSlug={app.slug}
                appName={app.name}
                currentVersion={app.version}
              />
              <span className={styles.installMeta}>
                {app.size_mb.toFixed(1)} MB &middot; v{app.version} &middot; Android {app.min_android_version}+
              </span>
            </div>
            <MonetizationDisclosure
              containsAds={app.contains_ads}
              hasInAppPurchases={app.has_in_app_purchases}
            />
          </div>
        </header>

        <section aria-labelledby="screenshots-heading">
          <h2 id="screenshots-heading" className={styles.sectionTitle}>
            Screenshots
          </h2>
          <ScreenshotCarousel app={app} />
        </section>

        <section aria-labelledby="description-heading">
          <h2 id="description-heading" className={styles.sectionTitle}>
            About this app
          </h2>
          <ExpandableDescription description={app.description} />
        </section>

        <section aria-labelledby="whats-new-heading">
          <h2 id="whats-new-heading" className={styles.sectionTitle}>
            What&rsquo;s New
          </h2>
          <Changelog app={app} />
        </section>

        <section aria-labelledby="ratings-heading">
          <h2 id="ratings-heading" className={styles.sectionTitle}>
            Ratings
          </h2>
          <RatingSummary app={app} />
          <RateThisApp appSlug={app.slug} />
        </section>

        <section aria-labelledby="verify-heading">
          <h2 id="verify-heading" className={styles.sectionTitle}>
            Verify this APK
          </h2>
          <ChecksumDisplay checksum={app.sha256_checksum} />
          <SignatureInfo fingerprint={app.signing_certificate_fingerprint} />
        </section>

        <section aria-labelledby="play-store-heading">
          <h2 id="play-store-heading" className={styles.sectionTitle}>
            Play Store Status
          </h2>
          <PlayStoreDisclosure app={app} />
        </section>

        <section aria-labelledby="permissions-heading">
          <h2 id="permissions-heading" className={styles.sectionTitle}>
            Permissions
          </h2>
          <PermissionsDisclosure permissions={app.permissions} />
        </section>

        <section aria-labelledby="data-safety-heading">
          <h2 id="data-safety-heading" className={styles.sectionTitle}>
            Data Safety
          </h2>
          <DataSafety dataSafety={app.data_safety} />
        </section>

        <section aria-labelledby="report-heading">
          <h2 id="report-heading" className={styles.sectionTitle}>
            Report a Problem
          </h2>
          <ReportAppForm appSlug={app.slug} />
        </section>

        <Shelf title="Similar Apps" apps={similarApps} />

        {/*
         * 0.j.ii.zi — sticky/anchored install action. Watches the primary
         * install row above (`#primary-install-row`) via IntersectionObserver
         * and only reveals a fixed bottom bar once that row has scrolled out
         * of view, so Install/Open/Update never scrolls out of reach on a
         * long description/screenshot/permissions listing. See
         * StickyInstallBar.tsx for the observer + reduced-motion details.
         */}
        <StickyInstallBar
          appSlug={app.slug}
          appName={app.name}
          currentVersion={app.version}
          primaryColor={app.primary_color}
          secondaryColor={app.secondary_color}
          tertiaryColor={app.tertiary_color}
          watchTargetId="primary-install-row"
        />
      </main>
    </CategoryThemeScope>
  );
}
