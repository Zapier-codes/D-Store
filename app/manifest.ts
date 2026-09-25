import type { MetadataRoute } from "next";

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
 * `icons` points at `public/icon.svg` (new, this leaf) — a static,
 * hand-authored brand mark using dark theme's own token *values*
 * (`app/globals.css`'s `--color-bg`/`--color-accent`/
 * `--color-accent-strong`), since a manifest icon has no CSS-variable
 * runtime to read from, unlike `AppIcon.tsx`'s per-app generated tiles.
 * One SVG covers both `"any"` and `"maskable"` purposes (see that
 * file's own header comment on why its safe-area math allows this)
 * rather than shipping two assets. A per-theme icon set is explicitly
 * out of scope here — that's `4.b.ii`'s "Theme-aware app icons", the
 * next milestone in this same track, not this leaf.
 *
 * `background_color`/`theme_color` reuse dark theme's own
 * `--color-bg`/`--color-accent` hex values for the same reason: no
 * light/dark manifest variant exists yet (a single manifest can't
 * switch with the visitor's theme cookie the way `app/layout.tsx`
 * does for `data-theme`), so this deliberately matches the site's
 * `DEFAULT_THEME` (`lib/theme.ts`, "dark") rather than either theme
 * arbitrarily. `theme_color` is also set as a `viewport` export below
 * per Next 15's split of that concern out of `metadata` (the
 * `themeColor` key inside a page/layout's `metadata` export was
 * deprecated in favor of a dedicated `viewport` export) — this file is
 * the single source for both, rather than duplicating the hex value in
 * `app/layout.tsx`.
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
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "D-Store",
    short_name: "D-Store",
    description: "F-Droid-style Android app store — no accounts required.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0908",
    theme_color: "#0a0908",
    orientation: "portrait-primary",
    categories: ["shopping", "utilities"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
