import { notFound } from "next/navigation";
import { getAppBySlug, getSimilarApps } from "@/lib/catalog";
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
import Shelf from "@/components/Shelf";
import styles from "./page.module.css";

/**
 * App detail page — leaf 0.e.i.zi (App Detail Page → Media → Screenshot
 * carousel), extended by 0.e.i.zo (lightbox), 0.e.ii.zi (expandable
 * description), 0.e.ii.zo (What's New changelog), 0.e.iii.zi (rating
 * stars + histogram), 0.e.iii.zo (anonymous rating submission),
 * 0.f.i.zi (SHA-256 checksum), 0.f.i.zo (digital signature info),
 * 0.f.ii.zi ("Why not on Play Store" disclosure), 0.f.ii.zo
 * (permissions disclosure), 0.f.iii.zi (anonymous "Report app" form),
 * and now 0.g.iii.zi (similar-apps rail, this leaf). This is the route
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
 * are complete for this page. `0.g.iii.zo` (developer profile page)
 * lands on a new route, not here.
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
  const initial = app.name.trim().charAt(0).toUpperCase();

  return (
    <main className={styles.main}>
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
