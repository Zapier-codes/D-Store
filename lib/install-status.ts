"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Device-local install status.
 *
 * There's no real APK pipeline yet (that's Phase 5), and — separate from
 * that — there is no general browser API that lets a website enumerate
 * arbitrary installed Android apps; that's deliberately not exposed to
 * the web platform for the same reason a site can't list your files.
 * The one real, narrow exception, `navigator.getInstalledRelatedApps()`,
 * only reports apps that are (a) listed in *this* page's own web app
 * manifest `related_applications` and (b) mutually verified via a
 * Digital Asset Links file hosted on the app's own domain — it can't
 * answer "is this random sideloaded APK installed," only "is the one
 * specific app this exact site is paired with installed." Since every
 * app here is a distinct catalog entry (not this site's own paired
 * app), that API doesn't apply.
 *
 * So this follows the same "anonymous, local-state-only" dummy
 * convention already established by RateThisApp (0.e.iii.zo),
 * ReportAppForm (0.f.iii.zi), and InstallButton's own click-to-simulate
 * state machine (3.a.iv.zi): a per-app record in `localStorage`,
 * *scoped to this browser/device*, recording which version was last
 * "installed" (simulated) here. That's what makes status genuinely
 * dynamic per visit rather than always starting cold — a returning
 * visitor on the same device sees "Open" (or "Update", if the catalog
 * version has since moved past what's recorded) instead of "Install"
 * again, and a version bump on the catalog side is what flips
 * "Open"/"Installed" over to "Update" automatically.
 */

export type InstallStatus = "not-installed" | "outdated" | "up-to-date";

interface InstalledRecord {
  version: string;
  installedAt: string; // ISO date
}

const STORAGE_PREFIX = "d-store:installed:";
const CHANGE_EVENT = "d-store-install-change";

function storageKey(appSlug: string): string {
  return `${STORAGE_PREFIX}${appSlug}`;
}

function readRecord(appSlug: string): InstalledRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(appSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.version !== "string") return null;
    return parsed as InstalledRecord;
  } catch {
    // Storage disabled/unavailable (private browsing, quota, etc.) —
    // fail soft to "not installed" rather than throwing.
    return null;
  }
}

function writeRecord(appSlug: string, version: string) {
  if (typeof window === "undefined") return;
  try {
    const record: InstalledRecord = { version, installedAt: new Date().toISOString() };
    window.localStorage.setItem(storageKey(appSlug), JSON.stringify(record));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { appSlug } }));
  } catch {
    // Best-effort only — same fail-soft posture as readRecord above.
  }
}

function clearRecord(appSlug: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(appSlug));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { appSlug } }));
  } catch {
    // Best-effort only.
  }
}

/** Numeric-aware dotted version compare — "1.10" > "1.9", "2.0" > "1.99". */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function resolveStatus(record: InstalledRecord | null, currentVersion: string): InstallStatus {
  if (!record) return "not-installed";
  return compareVersions(record.version, currentVersion) < 0 ? "outdated" : "up-to-date";
}

/**
 * Reads/writes this app's device-local install record and derives a
 * status against the catalog's current `currentVersion`. `loaded` is
 * false for the first client render (localStorage can't be read during
 * SSR, so this avoids a hydration-mismatch flash by rendering a neutral
 * "checking…" state until the effect below runs) — same pattern the
 * catalog's `SIMULATED_LATENCY_MS`-driven skeletons (3.a.iii.zi) already
 * use for "don't pretend we know yet."
 *
 * Listens for the same-tab `CHANGE_EVENT` so two mounted instances for
 * the same app (the header InstallButton and the StickyInstallBar,
 * 0.j.ii.zi) stay in sync without lifting state into a shared parent —
 * a click in one immediately updates the other.
 */
export function useInstallStatus(appSlug: string, currentVersion: string) {
  const [loaded, setLoaded] = useState(false);
  const [record, setRecord] = useState<InstalledRecord | null>(null);

  const refresh = useCallback(() => {
    setRecord(readRecord(appSlug));
    setLoaded(true);
  }, [appSlug]);

  useEffect(() => {
    refresh();
    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ appSlug: string }>).detail;
      if (detail?.appSlug === appSlug) refresh();
    }
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, [appSlug, refresh]);

  const status: InstallStatus = loaded ? resolveStatus(record, currentVersion) : "not-installed";

  const markInstalled = useCallback(
    (version: string) => writeRecord(appSlug, version),
    [appSlug],
  );
  const markUninstalled = useCallback(() => clearRecord(appSlug), [appSlug]);

  return { loaded, status, installedVersion: record?.version ?? null, markInstalled, markUninstalled };
}

/**
 * Shared "is this app's install/update animation currently running"
 * flag — separate from `InstalledRecord` above because it's transient
 * UI state (true only for the ~1.8s the simulated install/update is
 * running), not something worth persisting to `localStorage` or
 * surviving a reload. Exists so `InstallButton`'s click handler and a
 * sibling element elsewhere on the page — the app-icon's
 * `WavyProgressRing` overlay (0.j.v.zi, Play Store Parity Pass: match
 * the real Android app's circular wavy/crinkled progress ring around
 * the app icon, not just the button's own linear fill) — can react to
 * the same install run without a shared parent to lift state into,
 * same same-tab-custom-event approach `CHANGE_EVENT` above already
 * uses for cross-instance sync.
 *
 * Plain in-module `Map`, not `localStorage`: this only ever needs to
 * be read within the current page's lifetime — a reload mid-"install"
 * should NOT resume showing a ring (there's no real download to
 * resume), so it deliberately doesn't persist.
 */
export const SIMULATED_INSTALL_MS = 1800;

const PROGRESS_EVENT = "d-store-install-progress";
const activeInstalls = new Map<string, boolean>();

export function setInstallProgressActive(appSlug: string, active: boolean) {
  if (active) {
    activeInstalls.set(appSlug, true);
  } else {
    activeInstalls.delete(appSlug);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROGRESS_EVENT, { detail: { appSlug } }));
  }
}

export function useInstallProgress(appSlug: string): boolean {
  const [active, setActive] = useState(() => activeInstalls.get(appSlug) ?? false);

  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ appSlug: string }>).detail;
      if (detail?.appSlug === appSlug) setActive(activeInstalls.get(appSlug) ?? false);
    }
    setActive(activeInstalls.get(appSlug) ?? false);
    window.addEventListener(PROGRESS_EVENT, onChange);
    return () => window.removeEventListener(PROGRESS_EVENT, onChange);
  }, [appSlug]);

  return active;
}
