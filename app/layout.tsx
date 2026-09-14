import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "D-Store",
  description: "F-Droid-style Android app store — Phase 0 UI revamp (dummy data)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // data-theme is hardcoded to "dark" until theme persistence/toggle
  // lands (0.b.iii) — only the dark "Cinematic Gold" tokens exist so far.
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
