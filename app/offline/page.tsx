import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "You're offline — D-Store",
  description: "D-Store can't reach the network right now.",
};

/**
 * Offline fallback page — leaf 4.b.i.zo (Progressive Web App →
 * Installability → Service worker offline shell), the second `4.b.i`
 * leaf, right behind `4.b.i.zi` (Web app manifest).
 *
 * This is the "shell" the leaf name refers to: not full offline
 * browsing of the catalog (every page here is dynamic — `app/layout.tsx`
 * reads the theme/region cookies per request, and the catalog itself
 * comes from a runtime `fs.readFile`/merged-catalog call, `lib/catalog.ts`
 * — none of that is available with no network and no server), but a
 * graceful, on-brand response instead of the browser's default
 * "no internet" interstitial when a navigation fails offline.
 * `public/sw.js` precaches this exact route on install and serves it
 * for any failed navigation — see that file's own header comment.
 *
 * Deliberately static: no data fetching, no client component, nothing
 * that could itself fail or hang with no network. Reuses the
 * privacy/terms prose-page shell (`2.d.i.zi`/`zo`, `app/privacy/page.module.css`)
 * verbatim via its own copy of that CSS, the same "reuse the existing
 * shell rather than inventing a new one" convention `0.j.iv.zo` (the
 * About page) already followed for the same shell. No footer links or
 * header search are disabled here — `app/layout.tsx` still renders
 * `Header`/`Footer` around this page normally, since those are already
 * on the page before the network drops and their links simply won't
 * resolve to anything new until connectivity returns, same as any
 * other offline page in any other site.
 */
export default function OfflinePage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>You&rsquo;re offline</h1>
      <p className={styles.body}>
        D-Store can&rsquo;t reach the network right now, so this page couldn&rsquo;t load. Once
        you&rsquo;re back online, reload to pick up where you left off — anything you already had
        open in another tab isn&rsquo;t affected.
      </p>
      <p className={styles.body}>
        D-Store doesn&rsquo;t store the app catalog for offline browsing yet, so search, categories,
        and app pages all need a connection to load.
      </p>
    </main>
  );
}
