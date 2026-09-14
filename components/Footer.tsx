import Link from "next/link";
import styles from "./Footer.module.css";

/**
 * Site footer — leaf 0.c.iii.zi (legal links: Privacy, Terms, DMCA),
 * extended by 0.c.iii.zo (RSS link + "no account required" notice).
 *
 * A pure server component, styled entirely from the 0.b design tokens
 * (same convention as Header.tsx) so it re-themes automatically with
 * no per-component theme logic.
 *
 * /privacy, /terms, and /dmca don't exist as real pages yet — same
 * forward-reference pattern already used for /search and /categories
 * in Header.tsx. They'll 404 until a later leaf builds them.
 *
 * /feed.xml is the same kind of forward-reference: the real RSS/Atom
 * feed (new & updated apps) is a Section-4 feature and lands at
 * `4.c.i.zi`, not in Phase 0. Path chosen now (root-level `/feed.xml`,
 * the conventional location) so the link doesn't need to move once
 * the real route exists. The "no account required" copy is a direct
 * callout of the product's actual no-login model (see `lib/theme.ts`'s
 * cookie-only preference storage) rather than a new decision.
 */
export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.bar}>
        <span className={styles.copy}>
          &copy; {new Date().getFullYear()} D-Store &middot; No account required
        </span>

        <nav className={styles.legal} aria-label="Legal">
          <Link href="/privacy" className={styles.legalLink}>
            Privacy
          </Link>
          <Link href="/terms" className={styles.legalLink}>
            Terms
          </Link>
          <Link href="/dmca" className={styles.legalLink}>
            DMCA
          </Link>
          <Link
            href="/feed.xml"
            className={styles.legalLink}
            aria-label="RSS feed of new and updated apps"
          >
            RSS
          </Link>
        </nav>
      </div>
    </footer>
  );
}
