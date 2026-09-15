import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "About & Help — D-Store",
  description: "What D-Store is, how it works, and answers to common questions about installing FOSS Android apps without an account.",
};

/**
 * About D-Store / Help & FAQ page — leaf 0.j.iv.zo, closing out 0.j
 * (Play Store Parity Pass) in full.
 *
 * Distinct from the legal pages (0.c.iii/2.d.i — Privacy, Terms, DMCA):
 * this is mission/what-this-is copy plus practical Help & FAQ content,
 * not policy language. Reuses the same prose-page shell those pages
 * introduced (app/privacy, app/terms) rather than inventing a fourth
 * variant of the same long-form-text layout.
 *
 * The two pointers this leaf specifically calls for:
 *   - the anonymous Report flow (0.f.iii.zi, ReportAppForm.tsx) — that
 *     form lives on each app's own page, not a standalone route, so
 *     this page describes it and tells people where to find it rather
 *     than linking a route that doesn't exist.
 *   - the RSS feed (4.c.i.zi, /feed.xml) — linked the same
 *     forward-reference way Footer.tsx already does; not built yet,
 *     404s until then.
 *
 * FAQ content is grounded in real, already-shipped features (checksum/
 * signature verification 0.f.i, permissions/data-safety disclosures
 * 0.f.ii.zo/0.j.iii.zo, regional availability 0.h, anonymous
 * ratings/reports 1.a.iii), not invented placeholder questions.
 */
export default function AboutPage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>About D-Store</h1>

      <section className={styles.section}>
        <h2>What this is</h2>
        <p>
          D-Store is a browsable catalog of free and open-source Android apps, sourced from the
          F-Droid repository. Every app here is FOSS: no ads, no trackers, no non-free
          dependencies &mdash; that&rsquo;s F-Droid&rsquo;s own inclusion bar, not just a claim we
          make. There&rsquo;s no account to create. Browse, search, check an app&rsquo;s trust
          signals, and install &mdash; that&rsquo;s the whole flow.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Why sideloaded, not Play Store</h2>
        <p>
          Some apps here aren&rsquo;t on the Play Store at all, usually because their license or
          distribution model doesn&rsquo;t fit Play&rsquo;s policies &mdash; where we know the
          specific reason, it&rsquo;s shown right on that app&rsquo;s page. Installing outside the
          Play Store is called sideloading, and it&rsquo;s why every app here ships a SHA-256
          checksum and signing-certificate fingerprint you can verify yourself before installing.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Help &amp; FAQ</h2>

        <div className={styles.faqItem}>
          <h3>Do I need an account?</h3>
          <p>No. Nothing on D-Store requires signing up or logging in.</p>
        </div>

        <div className={styles.faqItem}>
          <h3>Is it safe to sideload an APK?</h3>
          <p>
            It carries more responsibility than installing from the Play Store, which is exactly
            why every app page shows a checksum and signing certificate &mdash; compare those
            against the values on the app&rsquo;s own official site before installing if
            you&rsquo;re unsure.
          </p>
        </div>

        <div className={styles.faqItem}>
          <h3>What does the &ldquo;Data safety&rdquo; section mean?</h3>
          <p>
            It&rsquo;s separate from the Permissions list. Permissions are what an app can ask
            Android for; Data safety is what actually happens to any data once collected &mdash;
            whether it&rsquo;s shared with anyone, and whether you can ask for it to be deleted.
          </p>
        </div>

        <div className={styles.faqItem}>
          <h3>Why don&rsquo;t I see every app?</h3>
          <p>
            A few apps are only shown in certain regions. See our{" "}
            <Link href="/privacy">Privacy Policy</Link> for how we approximate your region.
          </p>
        </div>

        <div className={styles.faqItem}>
          <h3>How do ratings and reports work?</h3>
          <p>
            Both are anonymous &mdash; no account needed for either. Rating an app is
            rate-limited per source to curb spam. Reporting a problem (a broken link, a security
            concern, and so on) isn&rsquo;t rate-limited, since a real report shouldn&rsquo;t be
            throttled; you&rsquo;ll find the &ldquo;Report this app&rdquo; form on that app&rsquo;s
            own page.
          </p>
        </div>

        <div className={styles.faqItem}>
          <h3>How do I stay notified about updates?</h3>
          <p>
            Subscribe to our <Link href="/feed.xml">RSS feed</Link> of new and updated apps.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2>More questions</h2>
        <p>
          For anything about an individual app, use the &ldquo;Report this app&rdquo; form on that
          app&rsquo;s page. For legal questions, see our <Link href="/privacy">Privacy Policy</Link>,{" "}
          <Link href="/terms">Terms of Service</Link>, or <Link href="/dmca">DMCA policy</Link>.
        </p>
      </section>
    </main>
  );
}
