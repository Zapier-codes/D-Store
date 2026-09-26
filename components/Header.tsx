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
 * chart pages arrive one at a time). `/charts/new` added the same way
 * by leaf `3.b.iii.zo`, closing out all of Phase 3's chart pages.
 *
 * `#nav-toggle` fixed by leaf `3.d.i.zo`: it previously carried both
 * `aria-hidden="true"` and a real keyboard/AT-reachable focus stop
 * (per Header.module.css's own comment, it's visually hidden, not
 * `display:none`, specifically so it stays tabbable) — aria-hidden on
 * a still-focusable, still-operable control is a real 4.1.2 failure,
 * not a stylistic choice: a keyboard user tabbing to it got no
 * accessible name at all, since aria-hidden removes it from the tree
 * before any name is computed. The aria-label moved from the visual
 * `<label>` (which carried it before, but a `<label>`'s own aria-label
 * isn't reliably surfaced as the associated control's accessible name)
 * onto the checkbox itself, which is the element that actually
 * receives focus.
 *
 * `/collections` added by leaf `4.c.ii.zo` (Editorial collections) —
 * not a forward reference, added the same "once the page exists" way
 * `/charts/top-free`/`/charts/new` were.
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
          aria-label="Toggle navigation menu"
        />
        <label htmlFor="nav-toggle" className={styles.navToggleLabel}>
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
          <Link href="/collections" className={styles.navLink}>
            Collections
          </Link>
          <Link href="/charts/top-free" className={styles.navLink}>
            Top Free
          </Link>
          <Link href="/charts/new" className={styles.navLink}>
            New &amp; Updated
          </Link>
          <ThemeToggle theme={theme} />
        </nav>
      </div>
    </header>
  );
}
