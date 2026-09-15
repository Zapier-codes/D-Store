import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy — D-Store",
  description: "How D-Store handles data: no accounts, cookie preferences, and what little is stored for anonymous ratings and reports.",
};

const LAST_UPDATED = "September 15, 2026";

/**
 * Privacy Policy page — leaf 2.d.i.zi (Legal & Compliance, Policies),
 * linked from the footer's "Privacy" link since 0.c.iii.zi (which
 * pointed at /privacy as a forward reference before this page existed).
 *
 * Content is grounded in what the app actually does today, not
 * boilerplate — pulled from the real implementations:
 *   - lib/theme.ts (0.b.iii.zi): d-store-theme cookie
 *   - lib/region.ts + lib/ipapi.ts (0.h.i.zi/zo): d-store-region
 *     cookie, ipapi.co lookup via middleware
 *   - Entity/Review.php (1.a.iii.zi): ip_hash, not a raw IP, for
 *     anonymous rating rate-limiting
 *   - Entity/ReportFlag.php (1.a.iii.zo): no identifier at all stored
 *     for reports — reason/details only
 * Placeholders that need real legal review before production use are
 * marked inline (contact address, governing jurisdiction) — this leaf
 * is accurate about the *technical* data flows, not a substitute for
 * counsel on the legal language around them.
 *
 * /dmca is linked the same forward-reference way Footer.tsx already
 * links it — that page is 2.d.ii.zo, not yet built, so it 404s until
 * then.
 */
export default function PrivacyPolicyPage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Privacy Policy</h1>
      <p className={styles.updated}>Last updated: {LAST_UPDATED}</p>

      <section className={styles.section}>
        <h2>No accounts</h2>
        <p>
          D-Store doesn&rsquo;t have user accounts, logins, or profiles.
          Browsing, searching, rating apps, and downloading APKs all work
          anonymously. There&rsquo;s no personal information for us to
          collect in the first place for any of that.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Cookies we set</h2>
        <p>We set exactly two cookies, both functional, neither used for tracking or advertising:</p>
        <ul>
          <li>
            <strong>d-store-theme</strong> — remembers whether you&rsquo;re using the dark or light
            theme, so it doesn&rsquo;t reset every visit. Lasts one year.
          </li>
          <li>
            <strong>d-store-region</strong> — caches an approximate region (see below) for the
            length of your session, so we don&rsquo;t look it up again on every page.
          </li>
        </ul>
        <p>Neither cookie is readable by, or shared with, any third party.</p>
      </section>

      <section className={styles.section}>
        <h2>Approximate region, from your IP address</h2>
        <p>
          Some apps in the catalog are only available in certain regions. To show you an accurate
          catalog, we look up an approximate region from your IP address the first time you visit
          in a session, using a third-party lookup service,{" "}
          <a href="https://ipapi.co" target="_blank" rel="noopener noreferrer">
            ipapi.co
          </a>
          . That lookup returns a country only &mdash; nothing more precise, like a city or exact
          coordinates &mdash; and your IP address is not stored by D-Store afterward; only the
          resulting country is cached, in the <strong>d-store-region</strong> cookie above. If the
          lookup fails or times out for any reason, we fall back to showing the full catalog rather
          than blocking your visit.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Ratings</h2>
        <p>
          Ratings are anonymous — we don&rsquo;t ask who you are. To prevent spam, we store a
          one-way hash of your IP address alongside a rating, so we can tell &ldquo;too many
          ratings from the same source in a short time&rdquo; apart from normal use. A hash can&rsquo;t
          be reversed back into your IP address. We don&rsquo;t store your actual IP address for
          this, and we don&rsquo;t link the hash to anything else you do on the site.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Reports</h2>
        <p>
          When you report an app (a broken link, a security concern, and so on), we store only the
          reason you selected and any details you typed in. We don&rsquo;t store an IP address, a
          hash of one, or any other identifier alongside a report — reports are fully anonymous,
          with no rate-limiting tied to who sent them.
        </p>
      </section>

      <section className={styles.section}>
        <h2>What we don&rsquo;t do</h2>
        <ul>
          <li>No advertising cookies or ad-tracking pixels.</li>
          <li>No analytics that identify individual visitors.</li>
          <li>No selling or sharing of data with data brokers.</li>
          <li>No account, so no profile of your activity to hand over, lose in a breach, or delete on request &mdash; there isn&rsquo;t one to begin with.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>APK downloads</h2>
        <p>
          Downloading an app fetches the APK file directly; that request doesn&rsquo;t pass through
          any D-Store account system, because there isn&rsquo;t one.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Children&rsquo;s privacy</h2>
        <p>
          Because we don&rsquo;t collect personal information from anyone, D-Store doesn&rsquo;t
          knowingly collect personal information from children either.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Changes to this policy</h2>
        <p>
          If what we collect or how we use it changes, we&rsquo;ll update this page and the
          &ldquo;Last updated&rdquo; date above.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Contact</h2>
        <p>
          For a copyright/DMCA concern, see our{" "}
          <Link href="/dmca">DMCA policy</Link>. For anything else about an individual app,
          including malware concerns or broken links, use the &ldquo;Report this app&rdquo; form on
          that app&rsquo;s page.
        </p>
      </section>
    </main>
  );
}
