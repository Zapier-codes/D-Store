import Link from "next/link";
import styles from "./Header.module.css";

/**
 * Site header — leaf 0.c.i.zi (responsive nav + search bar).
 *
 * A pure server component: the mobile nav open/close uses the
 * checkbox-hack pattern (hidden checkbox + label, shown/hidden purely
 * via CSS in Header.module.css) rather than client-side state, so no
 * 'use client' boundary is needed just to make the nav responsive.
 * The search bar is a plain GET <form>, which submits to /search?q=...
 * without any JavaScript.
 *
 * /search and /categories don't exist as real pages yet — they land in
 * 0.g (Search & Category Browse). Linking to them now is intentional,
 * the same forward-reference pattern used for design tokens ahead of
 * their consumers; they'll 404 until then.
 *
 * Theme toggle integration (0.c.i.zo) adds a ThemeToggle client
 * component into the nav — not present yet in this leaf.
 */
export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link href="/" className={styles.brand}>
          D-Store
        </Link>

        <form
          action="/search"
          method="GET"
          role="search"
          className={styles.search}
        >
          <input
            type="search"
            name="q"
            placeholder="Search apps"
            aria-label="Search apps"
            className={styles.searchInput}
          />
        </form>

        <input
          type="checkbox"
          id="nav-toggle"
          className={styles.navCheckbox}
          aria-hidden="true"
        />
        <label
          htmlFor="nav-toggle"
          className={styles.navToggleLabel}
          aria-label="Toggle navigation menu"
        >
          <span />
          <span />
          <span />
        </label>

        <nav className={styles.nav} aria-label="Primary">
          <Link href="/" className={styles.navLink}>
            Home
          </Link>
          <Link href="/categories" className={styles.navLink}>
            Categories
          </Link>
        </nav>
      </div>
    </header>
  );
}
