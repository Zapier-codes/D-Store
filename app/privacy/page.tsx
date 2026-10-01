import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentTenant } from "@/lib/tenant";
import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  // 6.b.ii.zi: tab title carries the resolved tenant's name; body copy below is still D-Store's (flagged in HANDOVER.md).
  const tenant = await getCurrentTenant();
  return {
    title: `Privacy Policy — ${tenant.branding.display_name}`,
    description: "How D-Store handles data: no accounts, cookie preferences, what little is stored for anonymous ratings and reports, and what is stored if you turn on update notifications.",
  };
}

const LAST_UPDATED = "September 29, 2026";

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
 *   - supabase/migrations/20260929120000_create_push_subscription_tables.sql
 *     (5.k.i.zi) and lib/push-store.ts (5.k.vii.zo): the "Update
 *     notifications" section (5.k.iv.zo). Written to be accurate before the
 *     opt-in (5.k.ii.zi) exists — every statement there is conditional on
 *     the visitor turning notifications on — and must stay in step with the
 *     schema: if a column is added to those tables, this section changes in
 *     the same commit.
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
          collect in the first place for any of that. The one optional exception is update
          notifications, which store a small record for your device only if you turn them on
          &mdash; see &ldquo;Update notifications&rdquo; below.
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
          hash of one, or any other identifier alongside a report, so a stored report cannot be
          traced back to you. To stop abuse, the report form is limited to a few reports an hour
          from one connection: for that, a salted, one-way hash of your address is kept in a
          separate table for the length of that window and then discarded. It is never written to
          the report and is not linked to it.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Update notifications (optional)</h2>
        <p>
          You can choose to be notified when an app you&rsquo;ve saved gets a new version. This is
          off unless you turn it on, and nothing described in this section is stored unless you do.
          It uses your browser&rsquo;s standard Web Push feature, and your browser asks for your
          permission first.
        </p>
        <p>If you turn it on, we store:</p>
        <ul>
          <li>
            <strong>A push address for your browser</strong> &mdash; a web address that your
            browser&rsquo;s push service (run by your browser&rsquo;s maker, not by us) gives us so
            we can send that one browser a notification.
          </li>
          <li>
            <strong>Two encryption keys</strong> that come with that address and are needed to
            encrypt a notification so only your browser can read it.
          </li>
          <li>
            <strong>The list of apps</strong> you asked to hear about, by app name in the catalog.
          </li>
          <li>The times the record was created and last refreshed.</li>
        </ul>
        <p>
          We don&rsquo;t store a name, an email address, an account or user ID, or your IP address
          with it, and we don&rsquo;t link it to your ratings, reports or anything else you do on
          the site. The push address is still a per-browser identifier, so treat it as data about
          your browser rather than as nothing. We use it only to send you these update
          notifications, and we don&rsquo;t share or sell it.
        </p>
        <p>
          A notification names the app and its new version. It is delivered through your
          browser&rsquo;s push service, which already knows your push address because it issued it,
          and which is subject to its own privacy policy.
        </p>
        <p>
          We delete the whole record &mdash; address, keys and app list &mdash; when you turn
          notifications off in D-Store, or when your browser&rsquo;s push service tells us the
          address is no longer valid. You can also switch notifications off in your browser&rsquo;s
          site settings; we may not learn of that until the next time we try to send you something.
          Because there is no account, we can&rsquo;t look a record up by who you are &mdash;
          turning notifications off in D-Store on the same browser is how you remove it.
        </p>
      </section>

      <section className={styles.section}>
        <h2>What we don&rsquo;t do</h2>
        <ul>
          <li>No advertising cookies or ad-tracking pixels.</li>
          <li>No analytics that identify individual visitors.</li>
          <li>No selling or sharing of data with data brokers.</li>
          <li>No account, so no profile of your activity to hand over, lose in a breach, or delete on request &mdash; the only per-device record is the optional notification subscription described above, and you can delete that yourself.</li>
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
          We don&rsquo;t ask anyone for a name, email address or account, so D-Store doesn&rsquo;t
          knowingly collect that kind of personal information from children either. Update
          notifications are optional and work the same way for everyone.
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
