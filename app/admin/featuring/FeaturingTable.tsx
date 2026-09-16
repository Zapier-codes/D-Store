"use client";

import { useState } from "react";
import type { App } from "@/lib/catalog";
import AppIcon from "@/components/AppIcon";
import styles from "./page.module.css";

/**
 * Client half of the `3.c.i.zi` admin toggle. Needs to be a client
 * component (unlike almost every other `app/**` page in this repo)
 * because each toggle fires an optimistic PATCH against
 * `app/api/admin/apps/[slug]/featuring/route.ts` and has to reflect
 * the new state immediately without a full page reload — the same
 * click-and-see-it-flip interaction `InstallButton` (`3.a.iv`)
 * already established for the storefront side, reused here for the
 * admin side.
 *
 * State is seeded from the server-fetched `apps` prop and then owned
 * locally; a toggle updates local state immediately (optimistic) and
 * rolls back if the PATCH fails, rather than waiting on the round
 * trip before showing any change — `lib/catalog.ts`'s simulated
 * latency (`SIMULATED_LATENCY_MS`) would otherwise make every click
 * feel laggy.
 */
export default function FeaturingTable({ apps: initialApps }: { apps: App[] }) {
  const [apps, setApps] = useState(initialApps);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [errorSlug, setErrorSlug] = useState<string | null>(null);

  async function toggle(slug: string, field: "is_featured" | "is_editors_pick") {
    const current = apps.find((a) => a.slug === slug);
    if (!current) return;

    const nextValue = !current[field];
    setErrorSlug(null);
    setPendingSlug(slug);
    setApps((prev) =>
      prev.map((a) => (a.slug === slug ? { ...a, [field]: nextValue } : a))
    );

    try {
      const res = await fetch(`/api/admin/apps/${slug}/featuring`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: nextValue }),
      });
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
    } catch {
      // Roll back on failure — flip it back to what it was before the click.
      setApps((prev) =>
        prev.map((a) => (a.slug === slug ? { ...a, [field]: !nextValue } : a))
      );
      setErrorSlug(slug);
    } finally {
      setPendingSlug(null);
    }
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.th}>App</th>
          <th className={styles.th}>Featured</th>
          <th className={styles.th}>Editors&rsquo; Pick</th>
        </tr>
      </thead>
      <tbody>
        {apps.map((app) => (
          <tr key={app.slug} className={styles.row}>
            <td className={styles.td}>
              <div className={styles.appCell}>
                <span className={styles.icon}>
                  <AppIcon
                    name={app.name}
                    primaryColor={app.primary_color}
                    secondaryColor={app.secondary_color}
                    tertiaryColor={app.tertiary_color}
                  />
                </span>
                <span>{app.name}</span>
              </div>
              {errorSlug === app.slug && (
                <span className={styles.error}>Update failed — reverted</span>
              )}
            </td>
            <td className={styles.td}>
              <button
                type="button"
                role="switch"
                aria-checked={app.is_featured}
                disabled={pendingSlug === app.slug}
                onClick={() => toggle(app.slug, "is_featured")}
                className={`${styles.toggle} ${app.is_featured ? styles.toggleOn : ""}`}
              >
                <span className={styles.toggleKnob} />
              </button>
            </td>
            <td className={styles.td}>
              <button
                type="button"
                role="switch"
                aria-checked={app.is_editors_pick}
                disabled={pendingSlug === app.slug}
                onClick={() => toggle(app.slug, "is_editors_pick")}
                className={`${styles.toggle} ${app.is_editors_pick ? styles.toggleOn : ""}`}
              >
                <span className={styles.toggleKnob} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
