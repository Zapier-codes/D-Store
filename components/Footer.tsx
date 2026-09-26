import Link from "next/link";
import { getPublicStats } from "@/lib/catalog";
import styles from "./Footer.module.css";

/**
 * Site footer — leaf 0.c.iii.zi (legal links: Privacy, Terms, DMCA),
 * extended by 0.c.iii.zo (RSS link + "no account required" notice),
 * 0.j.iv.zo (About link — the nav's aria-label changed from "Legal"
 * to "Site" accordingly, since About isn't a legal page), and 4.c.i.zo
 * (public stats: total apps, total downloads — docs/D-STORE.md §4E).
 *
 * Now an async server component (was a plain sync one through
 * 0.j.iv.zo) so it can call `getPublicStats()` (`lib/catalog.ts`,
 * `4.c.i.zo`) directly — same convention every page component in this
 * repo already uses to reach `lib/catalog.ts`, just from a shared
 * layout component instead of a route's `page.tsx`. Styled entirely
 * from the 0.b design tokens (same convention as Header.tsx) so it
 * re-themes automatically with no per-component theme logic.
 *
 * /privacy, /terms, /dmca, /about, and /feed.xml are all real pages
 * now (2.d.i.zi/zo, 2.d.ii.zo, 0.j.iv.zo, 4.c.i.zi respectively) — no
 * remaining forward references in this file's links.
 *
 * `5.g.iii.zo` — "Submit an app" link to the Console (Zealot) site,
 * the actual submission entry point per docs/D-STORE.md §8 ("This repo
 * has no submission UI... linking out to the Console site for anyone
 * who wants to submit an app"). Sourced from `NEXT_PUBLIC_CONSOLE_URL`
 * — same "configured, not hardcoded" pattern `ZEALOT_CATALOG_INDEX_BASE_URL`
 * already uses for the Console's index endpoint (`lib/sources/zealot.ts`),
 * and the same `NEXT_PUBLIC_` prefix `BASE_URL` already uses in
 * `app/sitemap.ts`/`app/feed.xml/route.ts` for this repo's own site URL.
 * Deliberately **no fallback URL is invented** here (unlike those two
 * call sites, which fall back to this repo's own known production
 * origin) — a wrong guess at the Console's real address would either
 * 404 or, worse, point at somewhere this repo doesn't control, and this
 * file's own honesty convention (`5.h.iii.zo`'s "Not provided", not an
 * invented default) already covers exactly this case: unset means the
 * link is simply omitted, never a dead or fabricated href.
 */
export default async function Footer() {
  const stats = await getPublicStats();
  const rawConsoleUrl = process.env.NEXT_PUBLIC_CONSOLE_URL?.trim();
  const consoleUrl =
    rawConsoleUrl && rawConsoleUrl.startsWith("https://") ? rawConsoleUrl : null;

  return (
    <footer className={styles.footer}>
      <div className={styles.bar}>
        <span className={styles.copy}>
          &copy; {new Date().getFullYear()} D-Store &middot; No account required
        </span>

        <span className={styles.stats}>
          {stats.totalApps.toLocaleString()} apps &middot; {stats.totalDownloads.toLocaleString()} downloads
        </span>

        <nav className={styles.legal} aria-label="Site">
          {consoleUrl && (
            <a
              href={consoleUrl}
              className={styles.legalLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Submit an app
            </a>
          )}
          <Link href="/about" className={styles.legalLink}>
            About
          </Link>
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

