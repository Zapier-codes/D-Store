import type { MetadataRoute } from "next";
import { getTheme } from "@/lib/theme";

/**
 * Web app manifest — leaf 4.b.i.zi (Phase 4 → Progressive Web App →
 * Installability), the first `4.b` leaf picked up after `4.a` (Ads
 * Infrastructure) was cancelled in full by operator directive — see
 * HANDOVER.md's "Priority override — Ads Infrastructure cancelled"
 * note.
 *
 * Next's App Router serves whatever `MetadataRoute.Manifest` this
 * default export returns at `/manifest.webmanifest` and links it from
 * `<head>` automatically — no manual `<link rel="manifest">` needed in
 * `app/layout.tsx`, matching the framework-native-API preference this
 * repo already follows elsewhere (native `<dialog>` for the lightbox,
 * IntersectionObserver for scroll reveal, etc.) rather than a
 * hand-rolled `public/manifest.json` plus manual `<link>` tag.
 *
 * `icons`/`background_color`/`theme_color` — leaf 4.b.ii.zi
 * ("Theme-aware app icons"). This file's icon/color fields were
 * originally dark-theme-only by construction, with 4.b.i.zi's own
 * header comment explicitly deferring a per-theme variant to this
 * milestone. Metadata route handlers (manifest/sitemap/robots) are
 * server functions like any other and can call the same dynamic APIs
 * a page can, so — same pattern `app/layout.tsx` already uses for
 * `data-theme` — this now calls `getTheme()` (`lib/theme.ts`,
 * 0.b.iii.zi) and resolves icon/color fields off the visitor's own
 * theme cookie rather than a hardcoded dark value. This makes the
 * route dynamic (opts out of static generation, same as any other
 * cookie-dependent response) — expected and correct for a manifest
 * that now varies per visitor.
 *
 * `public/icon.svg` (dark, 4.b.i.zi) and `public/icon-light.svg`
 * (light, new this leaf) are two separate hand-authored assets built
 * from each theme's own token *values* (a manifest icon has no
 * CSS-variable runtime to read from, unlike `AppIcon.tsx`'s per-app
 * generated tiles) — `icon-light.svg` genuinely diverges from the dark
 * icon's palette rather than being a brightness-inverted copy, per
 * this repo's standing "must diverge" rule for theme-adjacent assets
 * (see that file's own header comment). Each SVG still covers both
 * `"any"` and `"maskable"` purposes on its own (see icon.svg's header
 * comment on the safe-area math that allows this), so this leaf adds
 * one new asset, not four.
 *
 * `background_color`/`theme_color` now read the resolved theme's own
 * `--color-bg`/`--color-accent` hex values (mirrored here since a
 * manifest route can't read `app/globals.css`'s CSS custom properties
 * at request time) instead of always matching `DEFAULT_THEME`.
 * `theme_color` is also set as a `viewport` export in
 * `app/layout.tsx`, which already resolves the same theme cookie for
 * `data-theme` — see that file for why the two mechanisms (manifest
 * field vs. `<meta name="theme-color">` tag) are kept in sync
 * separately rather than one deriving from the other.
 *
 * `display: "standalone"` and `start_url: "/"` are the two fields that
 * actually make the browser's install prompt available at all; the
 * rest (`short_name`, `description`, `categories`) are metadata a
 * platform's install UI reads but doesn't require. `id` is set to the
 * same `start_url` explicitly rather than left to the browser's
 * default-to-`start_url` behavior, so re-publishing this file later
 * (e.g. once a real `start_url` with query params exists) can't
 * accidentally change the installed app's identity and orphan
 * existing installs.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const theme = await getTheme();

  const iconSrc = theme === "light" ? "/icon-light.svg" : "/icon.svg";
  // Mirrors app/globals.css's [data-theme="dark"|"light"] --color-bg /
  // --color-accent values — kept in sync by hand since this route has
  // no CSS-variable runtime to read from (see header comment above).
  const backgroundColor = theme === "light" ? "#f7f8fa" : "#0a0908";
  const themeColor = theme === "light" ? "#2454c9" : "#0a0908";

  return {
    id: "/",
    name: "D-Store",
    short_name: "D-Store",
    description: "F-Droid-style Android app store — no accounts required.",
    start_url: "/",
    display: "standalone",
    background_color: backgroundColor,
    theme_color: themeColor,
    orientation: "portrait-primary",
    categories: ["shopping", "utilities"],
    icons: [
      {
        src: iconSrc,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: iconSrc,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
