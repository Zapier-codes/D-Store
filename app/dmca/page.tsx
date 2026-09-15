import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "DMCA Policy — D-Store",
  description: "How to file a copyright takedown notice or counter-notice for an app listed on D-Store.",
};

const LAST_UPDATED = "September 15, 2026";

/**
 * DMCA / takedown process page — leaf 2.d.ii.zo, closing out 2.d.ii.
 * Linked from the footer's "DMCA" link since 0.c.iii.zi, and from the
 * Privacy Policy (2.d.i.zi) and Terms of Service (2.d.i.zo), all of
 * which have pointed at /dmca as a forward reference before this page
 * existed.
 *
 * Same grounding approach as the other two legal pages: describes the
 * real process this app supports, not generic takedown boilerplate.
 *   - Distinguishes the quick "Copyright / DMCA issue" reason on the
 *     anonymous Report-app form (ReportAppForm.tsx, 0.f.iii.zi — the
 *     exact string copied verbatim from that component's REASONS
 *     list) from a *formal* DMCA notice: the report form is
 *     intentionally anonymous/no-identity (docs/D-STORE.md §5.F: "no
 *     accounts means lightweight, not review-thread moderation"),
 *     while a statutory DMCA notice legally requires a signature and
 *     contact information a report can't carry. This page is explicit
 *     that the two aren't the same thing, rather than conflating them.
 *   - References the real per-app `license` and `source` fields on
 *     Entity/Application.php (same fields the Terms of Service,
 *     2.d.i.zo, already grounds its "License and copyright" section
 *     in) as the reason most listed apps are unlikely to be
 *     infringing to begin with, without overstating that as a
 *     guarantee.
 * Designated-agent contact details are a placeholder needing real
 * legal review before production, called out inline — same convention
 * the Privacy Policy and Terms of Service already use for their own
 * placeholders (contact address, governing jurisdiction).
 */
export default function DmcaPolicyPage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>DMCA Policy</h1>
      <p className={styles.updated}>Last updated: {LAST_UPDATED}</p>

      <section className={styles.section}>
        <h2>Overview</h2>
        <p>
          D-Store is a sideloading catalog: most listed apps are open-source or otherwise freely
          licensed, and each app&rsquo;s page discloses its license and, where available, a link to
          its source. That said, we respond to valid copyright takedown notices under the Digital
          Millennium Copyright Act (DMCA) for any listing that infringes a copyright.
        </p>
      </section>

      <section className={styles.section}>
        <h2>This isn&rsquo;t the same as &ldquo;Report this app&rdquo;</h2>
        <p>
          Every app page has an anonymous &ldquo;Report this app&rdquo; form with a{" "}
          <em>Copyright / DMCA issue</em> option, meant for quickly flagging a listing for someone
          to look into. It&rsquo;s deliberately anonymous &mdash; no accounts, no identity check
          &mdash; so it can&rsquo;t carry what a legally valid DMCA notice requires: your contact
          information and a signature. Use that form for a quick flag; use the process below for a
          formal takedown notice.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Filing a takedown notice</h2>
        <p>To file a valid DMCA takedown notice, send us a written notice that includes:</p>
        <ul>
          <li>A physical or electronic signature of the copyright owner or someone authorized to act on their behalf.</li>
          <li>Identification of the copyrighted work you claim has been infringed.</li>
          <li>Identification of the material you claim is infringing, with enough detail for us to locate it &mdash; the app&rsquo;s name and its D-Store page URL is sufficient.</li>
          <li>Your contact information: name, address, phone number, and email address.</li>
          <li>A statement that you have a good-faith belief the use is not authorized by the copyright owner, its agent, or the law.</li>
          <li>A statement, under penalty of perjury, that the information in the notice is accurate and that you are the copyright owner or authorized to act on their behalf.</li>
        </ul>
        <p>
          Send notices to <strong>[designated-agent email &mdash; placeholder, needs a real
          address before production]</strong>. Incomplete notices may delay our response while we
          ask for the missing information.
        </p>
      </section>

      <section className={styles.section}>
        <h2>What happens next</h2>
        <p>
          On receiving a valid notice, we remove or disable access to the identified listing and
          notify whoever submitted it, where we have a way to reach them. Removal doesn&rsquo;t
          require us to make a determination on the underlying copyright claim &mdash; that&rsquo;s
          what the counter-notice process below is for.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Counter-notice</h2>
        <p>
          If you believe a listing was removed in error or misidentification, you may file a
          counter-notice including:
        </p>
        <ul>
          <li>Your physical or electronic signature.</li>
          <li>Identification of the material that was removed, and where it appeared before removal.</li>
          <li>A statement, under penalty of perjury, that you have a good-faith belief the material was removed as a result of mistake or misidentification.</li>
          <li>Your name, address, and phone number, and a statement consenting to the jurisdiction of the federal court for your district (or, if outside the US, an appropriate judicial district).</li>
        </ul>
        <p>
          Send counter-notices to the same address above. Upon receiving a valid counter-notice, we
          may restore the material within the timeframe the DMCA specifies, unless the original
          notice-sender informs us they&rsquo;ve filed a court action seeking an order to restrain
          the alleged infringer.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Repeat infringers</h2>
        <p>
          We reserve the right to remove listings, and to not re-list an app, where we&rsquo;ve
          received repeated valid takedown notices concerning it.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Not legal advice</h2>
        <p>
          This page describes our process; it isn&rsquo;t legal advice about whether a specific
          notice or counter-notice is valid. If you&rsquo;re unsure, consider consulting an
          attorney before filing.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Related policies</h2>
        <p>
          See our <Link href="/privacy">Privacy Policy</Link> for how we handle data, and our{" "}
          <Link href="/terms">Terms of Service</Link> for the license and copyright terms that
          apply to the catalog generally.
        </p>
      </section>
    </main>
  );
}
