import Link from "next/link";
import type { Theme } from "@/lib/theme";
import ThemeToggle from "./ThemeToggle";
import SearchBar from "./SearchBar";
import styles from "./Header.module.css";

/**
 * Site header — leaf 0.c.i.zi (responsive nav + search bar), extended
 * by 0.c.i.zo (theme toggle integration) and 0.g.i.zi (instant search
 * suggestions).
 *
 * A pure server component itself: the mobile nav open/close uses the
 * checkbox-hack pattern (hidden checkbox + label, shown/hidden purely
 * via CSS in Header.module.css) rather than client-side state, so no
 * 'use client' boundary is needed just to make the nav responsive.
 * The search bar was originally a plain GET <form> rendered directly
 * here; as of 0.g.i.zi it's the <SearchBar> client component
 * (components/SearchBar.tsx), which still submits to /search?q=...
 * as a real form (no-JS fallback preserved) but now also shows
 * instant suggestions as a progressive enhancement. The other client
 * boundary in the header is <ThemeToggle> itself, which needs to call
 * a server action — see ThemeToggle.tsx.
 *
 * /search and /categories don't exist as real pages yet — they land in
 * 0.g (Search & Category Browse). Linking to them now is intentional,
 * the same forward-reference pattern used for design tokens ahead of
 * their consumers; they'll 404 until then.
 *
 * `/charts/top-free` added by leaf `3.b.iii.zi` once that page existed
 * (unlike `/search`/`/categories` above, not a forward reference —
 * chart pages arrive one at a time, `3.b.iii.zo`'s New & Updated chart
 * doesn't have a nav entry yet since it doesn't exist yet either).
 */
export default function Header({ theme }: { theme: Theme }) {
  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link href="/" className={styles.brand}>
          D-Store
        </Link>

        <SearchBar />

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
          <Link href="/charts/top-free" className={styles.navLink}>
            Top Free
          </Link>
          <ThemeToggle theme={theme} />
        </nav>
      </div>
    </header>
  );
}
