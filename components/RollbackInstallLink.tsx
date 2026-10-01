"use client";

import type { ReactNode } from "react";
import { recordInstalledVersion } from "@/lib/install-status";

interface RollbackInstallLinkProps {
  href: string;
  slug: string;
  version: string;
  className?: string;
  children: ReactNode;
}

/**
 * Download link for an older version — leaf `5.c.xi.zi` (split out of
 * `5.c.iii.zi`), rewritten onto `recordInstalledVersion`.
 *
 * On click it records the older version in the device-local install record
 * through the one writer in `lib/install-status.ts`, which owns the key, the
 * record shape and the change event; this component knows none of them. The
 * Install button then shows "Update", the honest next step after a rollback.
 * Recording on click is the same simulated convention `InstallButton` uses (a
 * click is not proof of an install). Whether to record at all is an open
 * operator call; to record nothing, delete the one `onClick` line below.
 *
 * The click is never prevented: the navigation is the download.
 */
export default function RollbackInstallLink({ href, slug, version, className, children }: RollbackInstallLinkProps) {
  return (
    <a
      className={className}
      href={href}
      rel="noopener noreferrer"
      onClick={() => recordInstalledVersion(slug, version)}
    >
      {children}
    </a>
  );
}
