import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Terms of Service — D-Store",
  description: "The terms for using D-Store: what the catalog is, sideloading responsibility, no-account ratings and reports, and content rules.",
};

const LAST_UPDATED = "September 15, 2026";

/**
 * Terms of Service page — leaf 2.d.i.zo (Legal & Compliance, Policies),
 * closing out 2.d.i. Linked from the footer's "Terms" link since
 * 0.c.iii.zi (which pointed at /terms as a forward reference before
 * this page existed).
 *
 * Same grounding approach as the Privacy Policy (2.d.i.zi,
 * app/privacy/page.tsx): sourced from what the app actually is/does,
 * not generic ToS boilerplate.
 *   - This is a sideloading catalog (docs/D-STORE.md §3: "Sideload-first
 *     distribution"), not a Play-Store-style reviewed marketplace — the
 *     "Sideloading is your responsibility" section states that
 *     directly, and points at the real per-app trust signals that exist
 *     for it: `sha256_checksum` and `play_store_rejection_reason` on
 *     `Entity/Application.php` (1.a.ii.zo).
 *   - No accounts (docs/D-STORE.md §3) — ratings and reports are
 *     anonymous, same as the Privacy Policy describes; this page covers
 *     the *behavioral* rule (don't abuse the anonymous flows) rather
 *     than repeating the data-handling detail, which stays the Privacy
 *     Policy's job.
 *   - Report reasons quoted in "Content and conduct" match
 *     `Entity/ReportFlag.php`'s (1.a.iii.zo) real fixed category list
 *     (mirrors the dummy `ReportAppForm.tsx`, 0.f.iii.zi) rather than
 *     an invented list.
 *   - `license` is a real per-app field (`Entity/Application.php`), so
 *     the "License and copyright" section describes it as the
 *     authoritative per-app terms it actually is, not a store-wide EULA
 *     that would contradict a project's own license.
 * Placeholders needing real legal review before production (contact
 * address, governing jurisdiction, age minimum) are called out inline,
 * matching the Privacy Policy's convention, rather than assumed.
 *
 * Links to /dmca the same forward-reference way Footer.tsx and the
 * Privacy Policy already do — that page is 2.d.ii.zo, not yet built.
 */
export default function TermsOfServicePage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Terms of Service</h1>
      <p className={styles.updated}>Last updated: {LAST_UPDATED}</p>

      <section className={styles.section}>
        <h2>What D-Store is</h2>
        <p>
          D-Store is a catalog of Android apps distributed outside the Play Store &mdash; a
          sideloading-first store, not a Play-Store-style reviewed marketplace. Some listed apps
          disclose a reason they&rsquo;re not on the Play Store; that disclosure is informational,
          not a guarantee about any app&rsquo;s safety or behavior.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Sideloading is your responsibility</h2>
        <p>
          Installing an APK from outside the Play Store is a deliberate action you take on your
          own device, and it&rsquo;s your responsibility. We don&rsquo;t run app review the way an
          app-store operator with a submission process would. To help you verify what
          you&rsquo;re installing, we publish a SHA256 checksum and, where available, digital
          signature information for each app&rsquo;s APK &mdash; check it against the file you
          downloaded before installing if you want that assurance. We don&rsquo;t warrant that any
          listed app is free of bugs, malware, or other problems; use the &ldquo;Report this
          app&rdquo; flow on an app&rsquo;s page if you find one.
        </p>
      </section>

      <section className={styles.section}>
        <h2>No accounts, anonymous ratings and reports</h2>
        <p>
          D-Store has no accounts or logins. Ratings and reports are anonymous by design &mdash;
          see our <Link href="/privacy">Privacy Policy</Link> for exactly what little we store
          alongside each. By submitting a rating or a report, you agree not to abuse either flow:
          no spam ratings, no fake or bad-faith reports, no automated/scripted submissions.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Content and conduct</h2>
        <p>
          The &ldquo;Report this app&rdquo; form exists so anyone can flag a listing for: a broken
          download link, a malware or security concern, inappropriate content, a copyright/DMCA
          issue, or another reason not covered by those. Don&rsquo;t submit a report you know to be
          false. For a copyright/DMCA concern specifically, use our{" "}
          <Link href="/dmca">DMCA policy</Link> instead, which has its own process.
        </p>
      </section>

      <section className={styles.section}>
        <h2>License and copyright</h2>
        <p>
          Each app in the catalog is distributed under its own license, shown on that app&rsquo;s
          page &mdash; these terms don&rsquo;t override it. We don&rsquo;t claim ownership of any
          listed app; app names, icons, and descriptions belong to their respective developers.
          D-Store&rsquo;s own site (layout, design, and catalog presentation, as distinct from the
          apps listed in it) is provided as-is.
        </p>
      </section>

      <section className={styles.section}>
        <h2>No warranty</h2>
        <p>
          D-Store and the app catalog are provided &ldquo;as is,&rdquo; without warranties of any
          kind, express or implied. We don&rsquo;t guarantee uninterrupted availability, that every
          listing is accurate or current, or that any app will work as described.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Changes to these terms</h2>
        <p>
          If these terms change, we&rsquo;ll update this page and the &ldquo;Last updated&rdquo;
          date above. Continued use of D-Store after a change means you accept the updated terms.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Contact</h2>
        <p>
          For a copyright/DMCA concern, see our <Link href="/dmca">DMCA policy</Link>. For
          anything else about an individual app, use the &ldquo;Report this app&rdquo; form on that
          app&rsquo;s page.
        </p>
      </section>
    </main>
  );
}
