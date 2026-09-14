import { notFound } from "next/navigation";
import { getAppBySlug } from "@/lib/catalog";
import ScreenshotCarousel from "@/components/ScreenshotCarousel";
import ExpandableDescription from "@/components/ExpandableDescription";
import Changelog from "@/components/Changelog";
import styles from "./page.module.css";

/**
 * App detail page — leaf 0.e.i.zi (App Detail Page → Media → Screenshot
 * carousel), extended by 0.e.i.zo (lightbox), 0.e.ii.zi (expandable
 * description), and 0.e.ii.zo (What's New changelog, this leaf). This
 * is the route `/app/[slug]` itself (created by 0.e.i.zi) — every
 * card/hero link built so far (AppCard 0.c.ii.zo, Hero 0.d.i.zi) has
 * pointed here as a forward reference.
 *
 * Header (icon/name/summary), screenshot carousel, description, and now
 * the changelog block are wired in — the rest of the detail page
 * (ratings, trust & safety, similar apps) lands piece by piece in the
 * remaining 0.e/0.f/0.g leaves, appended to this same page, the same
 * incremental pattern `app/page.tsx` followed across 0.d.
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
    </main>
  );
}
