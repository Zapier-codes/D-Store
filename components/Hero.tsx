import Link from "next/link";
import type { App } from "@/lib/catalog";
import AppIcon from "./AppIcon";
import CountUp from "./CountUp";
import HeroTilt from "./HeroTilt";
import { combinedDownloadTotal, combinedRating } from "@/lib/carried-over-stats";
import HeroCarousel from "./HeroCarousel";
import styles from "./Hero.module.css";

/**
 * Home hero — a horizontally scrolling row of big, tappable cards, one per featured first-party app.
 *
 * History: leaf 0.d.i.zi built a single cinematic hero; leaf 0.j.v.zo made it a compact glass card;
 * operator-directed 2026-10-08 turned it into the row below. What changed, and why:
 *
 * - **Bigger.** The card is now the loudest thing on the home page: a large icon, a large name, a
 *   two-line summary and a taller panel. The glass surface, the soft glow from the app's own palette
 *   and the light flare from 0.j.v.zo are kept.
 * - **No View button.** The whole card is the link to `/app/<slug>` (one `<Link>` wrapping the card),
 *   so a tap anywhere opens the details page. Nothing interactive sits inside it.
 * - **One to ten cards.** `app/page.tsx` passes at most `HERO_MAX` (10) first-party apps flagged
 *   featured (`lib/hero.ts` picks them). With one app the card fills the width and nothing scrolls;
 *   with more than one the row scrolls horizontally (scroll-snap) and `HeroCarousel` advances to the
 *   next card by itself, pausing while the visitor touches, hovers or focuses it.
 * - **Soft pulse.** Each card breathes a soft accent glow (`heroPulse` in Hero.module.css), off for
 *   visitors who prefer reduced motion.
 *
 * Server component: the cards are rendered here and handed to the client `HeroCarousel` as children,
 * the same pattern `ScrollReveal` uses, so only the scrolling behaviour is client code.
 *
 * `priority` on the first card's icon — leaf `3.d.ii.zo` (LCP budget pass). The first card is always
 * above the fold; the others are off to the side and stay lazy.
 *
 * The first card's name is the page's `<h1>` (it always was); later cards use `<h2>`.
 *
 * Operator-directed 2026-10-08 (card grew, so the detail grew with it): the name is 3D glass type (see
 * `.name` in Hero.module.css), every button-like item is a transparent glass pill, the downloads figure is
 * a large animated counter in its own stat column (no empty space on the right), and the card tilts toward
 * a mouse pointer with a light glare (`HeroTilt`). The whole card is still one link; the "Get" pill is a
 * visual cue, not a second control.
 */
export default function Hero({ apps }: { apps: App[] }) {
  if (apps.length === 0) return null;

  return (
    <HeroCarousel label="Featured apps">
      {apps.map((app, index) => (
        <HeroCard key={app.slug} app={app} first={index === 0} />
      ))}
    </HeroCarousel>
  );
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function HeroCard({ app, first }: { app: App; first: boolean }) {
  // A soft, low-opacity glow hinting at the app's own palette, not a solid fill, so the page's own
  // background still reads through the glass (0.j.v.zo).
  const backgroundStyle: React.CSSProperties = {
    background: [
      `radial-gradient(ellipse 70% 100% at 0% 50%, ${app.primary_color}40, transparent 70%)`,
      `radial-gradient(ellipse 60% 100% at 100% 30%, ${app.secondary_color}30, transparent 70%)`,
    ].join(", "),
  };

  const Heading = first ? "h1" : "h2";

  // First-party only (lib/hero.ts): store-native figures with any carried-over history folded in (Task 45b).
  const rating = combinedRating(app);
  const average = rating?.average ?? app.avg_rating;
  const ratingCount = rating?.count ?? app.rating_count;
  const carried = combinedDownloadTotal(app);
  const downloads = carried ?? app.install_count;
  const downloadsVariant = carried === null ? "exact" : "short";
  const downloadsLabel = carried === null ? "Installs" : "Downloads";
  const category = app.category && app.category !== "uncategorized" ? titleCase(app.category) : null;
  const hasLicense = Boolean(app.license) && app.license !== "Not provided";

  return (
    <HeroTilt className={styles.tilt}>
      <Link href={`/app/${app.slug}`} className={styles.card} style={backgroundStyle} aria-label={`${app.name}, featured app`}>
        <div className={styles.flare} aria-hidden="true" />
        <div className={styles.glare} aria-hidden="true" />

        <div className={styles.panel}>
          <div className={styles.iconWrap}>
            <div className={styles.icon}>
              <AppIcon
                name={app.name}
                primaryColor={app.primary_color}
                secondaryColor={app.secondary_color}
                tertiaryColor={app.tertiary_color}
                src={app.icon}
                sizes="140px"
                priority={first}
              />
            </div>
            <div className={styles.iconGlow} aria-hidden="true" style={{ background: app.primary_color }} />
          </div>

          <div className={styles.content}>
            <div className={styles.pills}>
              <span className={`${styles.pill} ${styles.pillAccent}`}>
                <span aria-hidden="true">✦</span> Featured
              </span>
              {category && <span className={styles.pill}>{category}</span>}
            </div>

            <span className={styles.nameWrap}>
              <Heading className={styles.name}>{app.name}</Heading>
            </span>
            <div className={styles.summary}>{app.summary}</div>

            <div className={styles.pills}>
              <span className={`${styles.pill} ${styles.pillStar}`}>
                <span aria-hidden="true">★</span> {average.toFixed(1)}
                <span className={styles.pillMuted}> ({ratingCount.toLocaleString()})</span>
              </span>
              {app.version && <span className={styles.pill}>v{app.version}</span>}
              {app.size_mb > 0 && <span className={styles.pill}>{Math.round(app.size_mb * 10) / 10} MB</span>}
              {app.min_android_version && app.min_android_version !== "Not provided" && (
                <span className={`${styles.pill} ${styles.pillOptional}`}>{app.min_android_version}+</span>
              )}
              {hasLicense && <span className={`${styles.pill} ${styles.pillOptional}`}>{app.license}</span>}
            </div>
          </div>

          <div className={styles.stat}>
            <div className={styles.statValue}>
              <CountUp target={downloads} variant={downloadsVariant} />
            </div>
            <div className={styles.statLabel}>{downloadsLabel}</div>
            <span className={`${styles.pill} ${styles.pillGet}`} aria-hidden="true">
              Get <span className={styles.arrow}>→</span>
            </span>
          </div>
        </div>
      </Link>
    </HeroTilt>
  );
}
