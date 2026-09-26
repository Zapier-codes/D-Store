"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Local favorites — leaf `4.d.i.zi`, first of two `4.d.i` leaves.
 *
 * D-Store has no accounts (no login rules out server-side per-user
 * storage, same constraint `lib/theme.ts`/`lib/install-status.ts`
 * already document), so "favoriting" an app is a per-device record,
 * same "anonymous, local-state-only" convention as install status,
 * ratings and reports. Unlike those, this leaf is asked for
 * **IndexedDB**, not `localStorage`: favorites are an unbounded,
 * open-ended list a visitor may grow over a long time (versus a single
 * small record per app), and IndexedDB is the right-sized browser
 * store for a small structured collection like that — it also leaves
 * room for `4.d.i.zo`'s "Saved apps" view to do a real indexed range
 * read (`getAll()`, ordered by an index) rather than deserializing one
 * big blob on every read the way a `localStorage` JSON array would
 * require.
 *
 * Scope of this leaf: the store itself (open/add/remove/list/has) and
 * a `useFavorite` hook so a toggle control (this leaf also wires one
 * into the app detail page's install row, next to Share — a store
 * with no write call site would be unverifiable) can read/flip a
 * single app's favorited state. The dedicated "Saved apps" page that
 * lists every favorite is `4.d.i.zo`, next.
 *
 * Fail-soft posture, same as `lib/install-status.ts`: IndexedDB can be
 * unavailable (private browsing in some browsers, disabled storage) or
 * a request can reject — every function below resolves to a safe
 * default (`false`, `null`, or an empty list) rather than throwing, so
 * a storage failure never blocks rendering.
 */

export interface FavoriteRecord {
  slug: string;
  name: string;
  icon: string;
  addedAt: string; // ISO date
}

const DB_NAME = "d-store-favorites";
const DB_VERSION = 1;
const STORE_NAME = "favorites";
const CHANGE_EVENT = "d-store-favorite-change";

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "slug" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function dispatchChange(slug: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { slug } }));
}

/** Every saved favorite, most-recently-added first. Empty on any failure. */
export async function listFavorites(): Promise<FavoriteRecord[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        const records = (request.result as FavoriteRecord[]) ?? [];
        records.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
        resolve(records);
      };
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/** Whether `slug` is currently favorited. `false` on any failure. */
export async function isFavorite(slug: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(slug);
      request.onsuccess = () => resolve(!!request.result);
      request.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function addFavorite(app: { slug: string; name: string; icon: string }): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const record: FavoriteRecord = {
        slug: app.slug,
        name: app.name,
        icon: app.icon,
        addedAt: new Date().toISOString(),
      };
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => {
        dispatchChange(app.slug);
        resolve();
      };
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function removeFavorite(slug: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(slug);
      tx.oncomplete = () => {
        dispatchChange(slug);
        resolve();
      };
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Reads/toggles a single app's favorited state. `loaded` is false for
 * the first client render (IndexedDB reads are always async, so this
 * avoids a hydration-mismatch flash the same way `useInstallStatus`
 * guards against one) until the initial lookup resolves.
 *
 * Listens for the same-tab `CHANGE_EVENT` so multiple mounted
 * instances for the same app — e.g. this app's detail-page button and
 * a future card-level heart icon — stay in sync without lifting state
 * into a shared parent, same pattern `useInstallStatus` already uses.
 */
export function useFavorite(app: { slug: string; name: string; icon: string }) {
  const { slug } = app;
  const [loaded, setLoaded] = useState(false);
  const [favorited, setFavorited] = useState(false);

  const refresh = useCallback(() => {
    let cancelled = false;
    isFavorite(slug).then((value) => {
      if (!cancelled) {
        setFavorited(value);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    const cancel = refresh();
    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ slug: string }>).detail;
      if (detail?.slug === slug) refresh();
    }
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      cancel();
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, [slug, refresh]);

  const toggle = useCallback(() => {
    if (favorited) {
      removeFavorite(slug);
    } else {
      addFavorite(app);
    }
    // Optimistic — the store write is fire-and-forget same as
    // `install-status.ts`'s writes, and the change event above will
    // reconcile this to the real state regardless.
    setFavorited((current) => !current);
  }, [favorited, slug, app]);

  return { loaded, favorited, toggle };
}
