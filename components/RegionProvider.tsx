"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { RegionLookupResult } from "@/lib/ipapi";

/**
 * Region-context provider (component-tree side) — leaf 0.h.i.zo. The
 * "exposes detected country/region to the component tree" half of the
 * leaf; `middleware.ts` + `lib/region.ts` are the "once per visitor
 * session" half.
 *
 * Seeded server-side (`app/layout.tsx` calls `getRegion()` and passes
 * the result in as a prop) rather than fetched client-side after
 * mount — same no-flash-of-default-then-swap reasoning `getTheme()` /
 * the `data-theme` attribute already uses for theme (0.b.iii.zi). This
 * is a thin client boundary purely because React context requires one;
 * there's no client-side fetching here at all.
 *
 * No consumers yet — nothing in the catalog is region-aware (that's
 * `0.h.ii`, still ahead). `useRegion()` exists now so the leaves that
 * follow have something to import instead of each hand-rolling their
 * own context.
 */

const RegionContext = createContext<RegionLookupResult | null>(null);

export default function RegionProvider({
  region,
  children,
}: {
  region: RegionLookupResult;
  children: ReactNode;
}) {
  return <RegionContext.Provider value={region}>{children}</RegionContext.Provider>;
}

/** Reads the visitor's detected region. Must be called from a descendant of `RegionProvider` (i.e. anywhere in `app/layout.tsx`'s tree). */
export function useRegion(): RegionLookupResult {
  const region = useContext(RegionContext);
  if (region === null) {
    throw new Error("useRegion() must be called within a RegionProvider");
  }
  return region;
}
