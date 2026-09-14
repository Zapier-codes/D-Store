import Link from "next/link";
import styles from "./Footer.module.css";

/**
 * Site footer — leaf 0.c.iii.zi (legal links: Privacy, Terms, DMCA).
 *
 * A pure server component, styled entirely from the 0.b design tokens
 * (same convention as Header.tsx) so it re-themes automatically with
 * no per-component theme logic.
 *
 * /privacy, /terms, and /dmca don't exist as real pages yet — same
 * forward-reference pattern already used for /search and /categories
 * in Header.tsx. They'll 404 until a later leaf builds them; linking
 * now keeps the footer's shape stable so 0.c.iii.zo (RSS link +
 * "no account required" notice) only has to add to this file, not
 * restructure it.
 */
export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.bar}>
        <span className={styles.copy}>
          &copy; {new Date().getFullYear()} D-Store
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
        </nav>
      </div>
    </footer>
  );
}
