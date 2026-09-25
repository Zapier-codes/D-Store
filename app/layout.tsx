import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getTheme } from "@/lib/theme";
import { getRegion } from "@/lib/region";
import { hasGivenConsent } from "@/lib/consent";
import RegionProvider from "@/components/RegionProvider";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ConsentBanner from "@/components/ConsentBanner";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

/**
 * `generateMetadata` — leaf 4.b.ii.zo (Progressive Web App →
 * Installability → Icons/splash → "Splash screens per theme").
 *
 * Was a static `export const metadata` until this leaf; converted to
 * Next's dynamic `generateMetadata()` form (same App Router mechanism
 * `app/manifest.ts` already uses via its own async default export) so
 * this can call `getTheme()` and resolve `appleWebApp.startupImage`
 * per visitor's theme cookie, the same pattern 4.b.ii.zi established
 * for the manifest's icon/color fields. `title`/`description` are
 * otherwise unchanged from the static object this replaces.
 *
 * `appleWebApp` is Next's typed metadata field for the iOS-specific
 * PWA meta tags — chosen over hand-writing raw `<link
 * rel="apple-touch-startup-image">` tags in a custom `<head>`
 * component, matching this repo's framework-native-API preference
 * (native `<dialog>`, `IntersectionObserver`, the manifest-file
 * convention itself, etc.) over a hand-rolled equivalent. iOS only
 * shows a launch splash screen for a site running in standalone mode
 * (`apple-mobile-web-app-capable`) and only reads it from these link
 * tags — it does not derive one from the web manifest the way
 * Android/Chrome does, so this is genuinely separate work from
 * 4.b.ii.zi's manifest changes, not a duplicate of them. `capable:
 * true` is included because it's the flag that makes iOS treat the
 * installed site as standalone at all — without it, none of the
 * `startupImage` entries below would ever be shown, so it's a
 * necessary part of enabling this leaf's feature rather than scope
 * creep from it. `statusBarStyle` is set per theme for the same
 * reason `theme_color` already varies per theme in `app/manifest.ts`:
 * a `black-translucent` bar over dark theme's near-black splash reads
 * as one continuous surface; light theme's default (dark-on-light) bar
 * does the same over its near-white splash — this is the one other
 * `appleWebApp` field genuinely coupled to "does the launch experience
 * look right," so it's included here rather than deferred to a
 * separate leaf.
 *
 * `startupImage` points at `public/splash.svg`/`public/splash-light.svg`
 * (new, this leaf) — see either file's own header comment for why one
 * scalable vector asset per theme, not a per-device raster set, is the
 * deliberate choice here. The `media` list below is a representative
 * subset of Apple's own (much longer) documented device-splash list —
 * one compact-phone, one standard-phone, one large-phone, and one
 * tablet breakpoint, covering the shape of every class of device
 * rather than every individual model Apple enumerates (several of
 * which share identical physical dimensions anyway, e.g. recent
 * same-size iPhone generations) — same "representative, not
 * exhaustive" scope this repo already applies elsewhere (e.g. `5.h`'s
 * curated Aptoide category set). A model not covered here still gets a
 * correctly themed, correctly proportioned splash from the nearest
 * matching breakpoint's vector asset; it just isn't pixel-matched to
 * that exact device's native resolution the way Apple's full raster
 * list would be.
 */
export async function generateMetadata(): Promise<Metadata> {
  const theme = await getTheme();
  const splashUrl = theme === "light" ? "/splash-light.svg" : "/splash.svg";

  return {
    title: "D-Store",
    description: "F-Droid-style Android app store — Phase 0 UI revamp (dummy data)",
    appleWebApp: {
      capable: true,
      title: "D-Store",
      statusBarStyle: theme === "light" ? "default" : "black-translucent",
      startupImage: [
        {
          url: splashUrl,
          media:
            "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
        },
        {
          url: splashUrl,
          media:
            "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
        },
        {
          url: splashUrl,
          media:
            "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
        },
        {
          url: splashUrl,
          media:
            "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
        },
      ],
    },
  };
}

// `themeColor` moved out of `metadata` into its own `viewport` export —
// leaf 4.b.i.zi (Web app manifest). Next 15 deprecated `themeColor`
// inside `metadata` in favor of this dedicated export; the hex value
// here is app/manifest.ts's own `theme_color`/`background_color`
// (dark theme's `--color-bg`), kept in sync manually since a
// manifest's `theme_color` and this `<meta name="theme-color">` tag
// are two separate mechanisms browsers read for the same purpose (the
// manifest field applies once installed as a standalone app; this tag
// applies to the browser chrome — e.g. Android's status bar — even
// before install) — see app/manifest.ts's own header comment for why
// dark theme's value was chosen over a per-theme swap.
export const viewport: Viewport = {
  themeColor: "#0a0908",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Theme is read from the cookie server-side (lib/theme.ts, 0.b.iii.zi)
  // and set on <html> before any HTML reaches the client — no flash,
  // no client-side swap after hydration. Falls back to DEFAULT_THEME
  // ("dark") for first-time visitors with no cookie yet.
  const theme = await getTheme();

  // Region is read the same way (lib/region.ts, 0.h.i.zo) — by the
  // time this renders, middleware.ts has already run for this request
  // and set the cookie if it wasn't already present, so this is always
  // reading a value, not triggering the ipapi.co lookup itself.
  const region = await getRegion();

  // Consent is read the same server-side-cookie way (lib/consent.ts,
  // 2.d.ii.zi) — if the visitor already acknowledged the notice on a
  // prior visit, the banner is simply absent from the first rendered
  // HTML rather than flashing in and then disappearing after a client
  // check.
  const consented = await hasGivenConsent();

  return (
    <html lang="en" data-theme={theme}>
      <body>
        <RegionProvider region={region}>
          <Header theme={theme} />
          {children}
          <Footer />
          {!consented && <ConsentBanner />}
          <ServiceWorkerRegister />
        </RegionProvider>
      </body>
    </html>
  );
}
