import Link from "next/link";
import type { App } from "@/lib/catalog";
import AppIcon from "./AppIcon";
import styles from "./Hero.module.css";

/**
 * Cinematic hero — leaf 0.d.i.zi (part of 0.d, Home Page), redesigned
 * by leaf 0.j.v.zo (Play Store Parity Pass — "blend into the shell,
 * don't sit on top of it as a big colored banner").
 *
 * Per docs/D-STORE.md §4A ("Cinematic hero — one featured app, one
 * deliberate visual moment") and §4C ("Glassmorphism — used once
 * deliberately (header, hero, modals), not on every card"). Still that
 * one deliberate glass moment for the home page — AppCard (0.c.ii.zo)
 * and the rest of the shell stay flat/opaque on purpose — but 0.j.v.zo
 * walks back how loud that moment reads: the original full-bleed,
 * near-viewport-height section with a bold saturated app-color
 * gradient filling the whole card read as a big banner block sitting
 * *on* the page rather than a glass surface blended *into* it. This
 * version is a compact rectangular card — the glass panel now covers
 * the entire card (not just a bottom strip over a solid backdrop), so
 * the page's own background/vignette shows through the whole thing,
 * with only a soft, low-opacity hint of the app's own color glowing
 * behind the glass rather than a solid fill.
 *
 * Takes a single `App` and renders it. Callers pick which app — this
 * component doesn't know about "featured" as a concept; the home page
 * (app/page.tsx) calls `getFeaturedApps()` and hands the first result
 * in, same prop-in pattern AppCard already uses.
 *
 * Light flare — leaf 0.j.v.zo — a soft diagonal highlight band
 * (`.flare`) that periodically sweeps across the glass, the same
 * "glossy sheen catching the light" motif real glass/frosted UI
 * surfaces use. Gated behind `prefers-reduced-motion`, same as every
 * other animation in this file.
 *
 * No real screenshot/banner art exists yet (`App.screenshots` are
 * dummy `/mock/...` paths that don't resolve to real images) — the
 * soft app-color glow stands in for hero artwork for now.
 *
 * Reveal animation — leaf 0.d.i.zo — lives entirely in Hero.module.css
 * (`.panel`/`.icon` `animation`, gated behind
 * `@media (prefers-reduced-motion: no-preference)`, same guard already
 * used by the theme-transition in app/globals.css). No client boundary
 * needed: the hero sits above the fold on first paint, so a plain CSS
 * `animation` that plays once on mount gives the "reveal" moment
 * without an IntersectionObserver — this stays a server component.
 *
 * `priority` on the icon — leaf `3.d.ii.zo` (LCP budget pass). The hero
 * is always the first thing painted, so its icon (when real) is marked
 * `priority` unconditionally rather than threading a prop in from the
 * caller — unlike AppCard, which only wants this for a few above-the-
 * fold call sites, every Hero render is above the fold by definition.
 */
export default function Hero({ app }: { app: App }) {
  // A soft, low-opacity glow hinting at the app's own palette — not a
  // solid fill — so the page's own background still reads through the
  // glass everywhere else on the card. See docstring above (0.j.v.zo).
  const backgroundStyle: React.CSSProperties = {
    background: [
      `radial-gradient(ellipse 70% 100% at 0% 50%, ${app.primary_color}33, transparent 70%)`,
      `radial-gradient(ellipse 60% 100% at 100% 30%, ${app.secondary_color}26, transparent 70%)`,
    ].join(", "),
  };

  return (
    <section className={styles.hero} style={backgroundStyle} aria-label="Featured app">
      <div className={styles.flare} aria-hidden="true" />

      <div className={styles.panel}>
        <div className={styles.icon}>
          <AppIcon
            name={app.name}
            primaryColor={app.primary_color}
            secondaryColor={app.secondary_color}
            tertiaryColor={app.tertiary_color}
            src={app.icon}
            sizes="64px"
            priority
          />
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
