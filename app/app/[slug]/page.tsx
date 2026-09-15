import { notFound } from "next/navigation";
import Link from "next/link";
import { getAppBySlug, getSimilarApps, getDeveloperBySlug, getCategoryBySlug } from "@/lib/catalog";
import ScreenshotCarousel from "@/components/ScreenshotCarousel";
import ExpandableDescription from "@/components/ExpandableDescription";
import Changelog from "@/components/Changelog";
import RatingSummary from "@/components/RatingSummary";
import RateThisApp from "@/components/RateThisApp";
import ChecksumDisplay from "@/components/ChecksumDisplay";
import SignatureInfo from "@/components/SignatureInfo";
import PlayStoreDisclosure from "@/components/PlayStoreDisclosure";
import PermissionsDisclosure from "@/components/PermissionsDisclosure";
import ReportAppForm from "@/components/ReportAppForm";
import InstallButton from "@/components/InstallButton";
import Shelf from "@/components/Shelf";
import AppStructuredData from "@/components/AppStructuredData";
import styles from "./page.module.css";

/**
 * App detail page — leaf 0.e.i.zi (App Detail Page → Media → Screenshot
 * carousel), extended by 0.e.i.zo (lightbox), 0.e.ii.zi (expandable
 * description), 0.e.ii.zo (What's New changelog), 0.e.iii.zi (rating
 * stars + histogram), 0.e.iii.zo (anonymous rating submission),
 * 0.f.i.zi (SHA-256 checksum), 0.f.i.zo (digital signature info),
 * 0.f.ii.zi ("Why not on Play Store" disclosure), 0.f.ii.zo
 * (permissions disclosure), 0.f.iii.zi (anonymous "Report app" form),
 * 0.g.iii.zi (similar-apps rail), and now 0.g.iii.zo (developer credit
 * link, below). This is the route
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
  const initial = app.name.trim().charAt(0).toUpperCase();

  return (
    <main className={styles.main}>
      <AppStructuredData
        app={app}
        categoryName={category?.name ?? null}
        developerName={developer?.name ?? null}
      />
      <header className={styles.header}>
        <div
          className={styles.icon}
          style={{ backgroundColor: app.primary_color, color: app.secondary_color }}
          aria-hidden="true"
        >
          {initial}
        </div>
        <div>
          <h1 className={styles.name}>{app.name}</h1>
          <p className={styles.summary}>{app.summary}</p>
          {developer && (
            <Link href={`/developer/${developer.slug}`} className={styles.developerLink}>
              by {developer.name}
            </Link>
          )}
          <div className={styles.installRow}>
            <InstallButton appName={app.name} />
          </div>
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
        <RateThisApp />
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

      <section aria-labelledby="report-heading">
        <h2 id="report-heading" className={styles.sectionTitle}>
          Report a Problem
        </h2>
        <ReportAppForm appSlug={app.slug} />
      </section>

      <Shelf title="Similar Apps" apps={similarApps} />
    </main>
  );
}
