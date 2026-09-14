import Link from "next/link";
import type { App } from "@/lib/catalog";
import styles from "./Hero.module.css";

/**
 * Cinematic hero — leaf 0.d.i.zi (part of 0.d, Home Page).
 *
 * Per docs/D-STORE.md §4A ("Cinematic hero — one featured app, one
 * deliberate visual moment") and §4C ("Glassmorphism — used once
 * deliberately (header, hero, modals), not on every card"). This is
 * that one deliberate glass moment for the home page — AppCard (0.c.ii.zo)
 * and the rest of the shell stay flat/opaque on purpose.
 *
 * Takes a single `App` and renders it full-bleed. Callers pick which
 * app — this component doesn't know about "featured" as a concept; the
 * home page (app/page.tsx) calls `getFeaturedApps()` and hands the
 * first result in, same prop-in pattern AppCard already uses.
 *
 * Background: unlike the rest of the shell (which runs entirely off
 * the 0.b design tokens so it re-themes automatically), the hero's
 * background gradient is built from the *app's own* dummy
 * primary/secondary/tertiary colors — the "cinematic, one deliberate
 * moment" is deliberately app-specific artwork, not a themed surface.
 * A dark scrim + `--gradient-vignette` (reused from 0.b.i.zo) sits on
 * top so panel text stays legible against any app's color set, in both
 * themes. No real screenshot/banner art exists yet (`App.screenshots`
 * are dummy `/mock/...` paths that don't resolve to real images), so
 * the gradient stands in for hero artwork for now — swapping in a real
 * banner image later only touches this file's background layer.
 *
 * Reveal animation — leaf 0.d.i.zo — lives entirely in Hero.module.css
 * (`.panel`/`.icon` `animation`, gated behind
 * `@media (prefers-reduced-motion: no-preference)`, same guard already
 * used by the theme-transition in app/globals.css). No client boundary
 * needed: the hero sits above the fold on first paint, so a plain CSS
 * `animation` that plays once on mount gives the "reveal" moment
 * without an IntersectionObserver — this stays a server component.
 */
export default function Hero({ app }: { app: App }) {
  const initial = app.name.trim().charAt(0).toUpperCase();

  const backgroundStyle: React.CSSProperties = {
    background: [
      `radial-gradient(ellipse 90% 80% at 15% 20%, ${app.primary_color}66, transparent 60%)`,
      `radial-gradient(ellipse 80% 90% at 85% 30%, ${app.secondary_color}4d, transparent 65%)`,
      `linear-gradient(160deg, ${app.tertiary_color}, ${app.primary_color})`,
    ].join(", "),
  };

  return (
    <section className={styles.hero} style={backgroundStyle} aria-label="Featured app">
      <div className={styles.scrim} />

      <div className={styles.panel}>
        <div
          className={styles.icon}
          style={{ backgroundColor: app.primary_color, color: app.secondary_color }}
          aria-hidden="true"
        >
          {initial}
        </div>

        <div className={styles.content}>
          <p className={styles.eyebrow}>Featured</p>
          <h1 className={styles.name}>{app.name}</h1>
          <p className={styles.summary}>{app.summary}</p>

          <div className={styles.meta}>
            <span className={styles.rating}>
              <span aria-hidden="true">★</span> {app.avg_rating.toFixed(1)}
              <span className={styles.metaMuted}> ({app.rating_count.toLocaleString()})</span>
            </span>
            <span className={styles.metaMuted}>{app.install_count.toLocaleString()}+ installs</span>
            <span className={styles.metaMuted}>{app.license}</span>
          </div>

          {/* /app/[slug] doesn't exist yet — lands in 0.e (App Detail Page).
              Same forward-reference convention already used by Header's
              /search and /categories links. */}
          <Link href={`/app/${app.slug}`} className={styles.cta}>
            View app
          </Link>
        </div>
      </div>
    </section>
  );
}
