import type { App } from "@/lib/catalog";
import styles from "./Changelog.module.css";

/**
 * "What's New" changelog block — leaf 0.e.ii.zo (App Detail Page →
 * Content), sibling to ExpandableDescription (0.e.ii.zi) in the "About
 * this app" area of the detail page.
 * Per docs/D-STORE.md §4B: "A 'What's New' changelog block."
 *
 * Pure server component — no interaction needed, unlike
 * ExpandableDescription (which needed client state for its toggle).
 * `App.changelog` (lib/mock-data.ts) is a single short release-notes
 * line per app (e.g. F-Droid's "Improved repo index signature
 * verification and faster mirror fallback."), paired here with the
 * existing `version` and `updated_at` fields for the version/date
 * header Play Store's own "What's New" card always shows alongside the
 * notes themselves.
 *
 * Only ever renders the single latest entry — there's no changelog
 * *history* in the data model (`App.changelog` is one string, not an
 * array), so there's nothing to page through yet. A real backend
 * (Phase 5) would need a `changelog[]`/release-history table to show
 * more than the current version's notes; out of scope for this leaf.
 */
export default function Changelog({ app }: { app: App }) {
  const formattedDate = new Date(app.updated_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.version}>Version {app.version}</span>
        <span className={styles.date}>{formattedDate}</span>
      </div>
      <p className={styles.notes}>{app.changelog}</p>
    </div>
  );
}
