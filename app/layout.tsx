import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "D-Store",
  description: "F-Droid-style Android app store — Phase 0 UI revamp (dummy data)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
