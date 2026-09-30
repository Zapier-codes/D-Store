"use client";

import React from "react";

interface RollbackInstallLinkProps {
  href: string;
  slug: string;
  version: string;
  children: React.ReactNode;
}

/**
 * Intercepts clicks on older-version download links to update the local
 * install status, so the main InstallButton correctly shows "Update" after
 * a user downloads an older APK.
 */
export default function RollbackInstallLink({ href, slug, version, children }: RollbackInstallLinkProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    try {
      const key = `d-store-install-${slug}`;
      const record = { version, installedAt: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(record));
      // Dispatch a custom event so any mounted InstallButton instances update immediately
      window.dispatchEvent(new CustomEvent("d-store-install-change", { detail: { slug, version } }));
    } catch {
      // Ignore localStorage errors (e.g. private browsing)
    }
    // Allow the default navigation to proceed (the actual APK download)
  };

  return (
    <a href={href} rel="noopener noreferrer" onClick={handleClick}>
      {children}
    </a>
  );
}
