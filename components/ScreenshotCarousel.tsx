import type { App } from "@/lib/catalog";
import styles from "./ScreenshotCarousel.module.css";

/**
 * Screenshot carousel — leaf 0.e.i.zi (App Detail Page → Media).
 *
 * Per docs/D-STORE.md §4B ("Screenshot carousel (swipeable, lightbox)").
 * This leaf is the swipeable carousel only — tapping/clicking a
 * screenshot to open a full-size lightbox viewer is the next leaf
 * (0.e.i.zo) and isn't wired up here.
 *
 * "Swipeable" is native CSS scroll-snap (`overflow-x: auto` +
 * `scroll-snap-type: x mandatory` on the track, `scroll-snap-align`
 * on each item) rather than a client-side carousel library or touch
 * handlers — touch/trackpad swiping and horizontal drag both work for
 * free, matching this repo's existing preference for CSS-only
 * interaction where possible (Header's checkbox-hack nav, the
 * prefers-reduced-motion-gated reveal/theme transitions) over adding
 * a new client component. Stays a plain server component.
 *
 * Placeholder rendering: `App.screenshots` (lib/mock-data.ts) holds
 * dummy `/mock/screenshots/...` paths that don't resolve to real image
 * files — no real screenshot assets exist in this repo yet (Hero.tsx,
 * 0.d.i.zi, notes the same gap for hero art). Rather than point <img>
 * at paths that 404 for every app, each slide renders a colored
 * placeholder tile using the app's own primary/secondary/tertiary
 * dummy color fields (same convention as AppCard's and Hero's icon
 * tiles, 0.c.ii.zo / 0.d.i.zi), cycling across the three so a
 * multi-screenshot app's slides are visually distinct from each other
 * rather than one flat color repeated. Swapping in real <img> slides
 * later only touches this one spot.
 */
export default function ScreenshotCarousel({ app }: { app: App }) {
  const { screenshots } = app;
  if (screenshots.length === 0) return null;

  const colors = [app.primary_color, app.secondary_color, app.tertiary_color];

  return (
    <div
      className={styles.carousel}
      role="region"
      aria-label={`${app.name} screenshots`}
    >
      <ul className={styles.track}>
        {screenshots.map((src, index) => (
          <li key={src} className={styles.slide}>
            <div
              className={styles.placeholder}
              style={{
                backgroundColor: colors[index % colors.length],
                color: app.primary_color === colors[index % colors.length]
                  ? app.secondary_color
                  : app.primary_color,
              }}
            >
              <span className={styles.placeholderLabel}>
                {app.name} — Screenshot {index + 1}
              </span>
            </div>
            <span className={styles.srOnly}>
              Screenshot {index + 1} of {screenshots.length}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
