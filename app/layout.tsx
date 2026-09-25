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

export const metadata: Metadata = {
  title: "D-Store",
  description: "F-Droid-style Android app store — Phase 0 UI revamp (dummy data)",
};

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
