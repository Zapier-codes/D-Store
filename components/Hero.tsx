import Link from "next/link";
import type { App } from "@/lib/catalog";
import AppIcon from "./AppIcon";
import FirstPartyStats from "./FirstPartyStats";
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

  return (
    <Link href={`/app/${app.slug}`} className={styles.card} style={backgroundStyle} aria-label={`${app.name}, featured app`}>
      <div className={styles.flare} aria-hidden="true" />

      <div className={styles.panel}>
        <div className={styles.icon}>
          <AppIcon
            name={app.name}
            primaryColor={app.primary_color}
            secondaryColor={app.secondary_color}
            tertiaryColor={app.tertiary_color}
            src={app.icon}
            sizes="120px"
            priority={first}
          />
        </div>

        <div className={styles.content}>
          <div className={styles.eyebrow}>Featured</div>
          <Heading className={styles.name}>{app.name}</Heading>
          <div className={styles.summary}>{app.summary}</div>

          <div className={styles.meta}>
            {/* First-party only (lib/hero.ts), so always the store-native figures, with any carried-over
                history folded in as one Play-Store-style total (Task 45b). */}
            <FirstPartyStats app={app} ratingClassName={styles.rating} mutedClassName={styles.metaMuted} />
            {app.license && app.license !== "Not provided" && <span className={styles.metaMuted}>{app.license}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
