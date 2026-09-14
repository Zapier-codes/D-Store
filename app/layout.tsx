import type { Metadata } from "next";
import "./globals.css";
import { getTheme } from "@/lib/theme";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "D-Store",
  description: "F-Droid-style Android app store — Phase 0 UI revamp (dummy data)",
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

  return (
    <html lang="en" data-theme={theme}>
      <body>
        <Header theme={theme} />
        {children}
      </body>
    </html>
  );
}
