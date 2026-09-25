import Link from "next/link";
import type { App } from "@/lib/catalog";
import AppIcon from "./AppIcon";
import { thirdPartyLabel } from "@/lib/trust";
import styles from "./AppCard.module.css";

/**
 * Small, dense app-card — leaf 0.c.ii.zo.
 *
 * The per-app unit that populates the `ShelfGrid` (0.c.ii.zi). Deliberately
 * minimal per D-STORE.md §3 ("Small, dense cards | Play-Store-density grid,
 * not oversized promo tiles everywhere"): icon, name, and a rating line —
 * nothing else competes for space at 2-column mobile width. Richer detail
 * (description, screenshots, permissions, changelog) is the app-detail
 * page's job (0.e), not the card's.
 *
 * Icon rendering: `App.icon` in the dummy first-party dataset
 * (lib/mock-data.ts) is a filename like "f-droid.png" with no backing
 * asset, so `AppIcon` renders a colored initial tile from the app's
 * own `primary_color`/`secondary_color` dummy fields for those. Since
 * `5.h.ii.zi`, third-party (Aptoide) entries carry a real `App.icon`
 * URL — `src={app.icon}` is passed straight through to `AppIcon`,
 * which (as of `3.d.ii.zi`) renders it as an optimized, responsive
 * `next/image` when it's a real `https://` URL and falls back to the
 * same generated tile otherwise. Every card still gets a
 * correctly-colored, non-broken icon either way — this file doesn't
 * need to know which case it's in.
 *
 * Pure server component — no interaction of its own yet. The whole card
 * is a single link out to the (not-yet-built, 0.e) app detail page at
 * /app/[slug], which is the dense-grid convention Play Store itself uses
 * (tap anywhere on the card, not just the icon or the name).
 *
 * Optional `rank` — leaf `3.b.iii.zi` (Top Free chart page). Rather than
 * building a separate ranked-list component just for chart pages, this
 * stays the one card every grid in the app already uses (search,
 * categories, shelves) and grows a small numbered badge over the icon
 * when a caller supplies a position — keeping charts visually
 * consistent with every other listing instead of introducing a second
 * card style, per §3's grid-density decision applying uniformly.
 *
 * Origin label — leaf `5.h.i.zo`. HANDOVER.md's "Resolved — catalog
 * sources" rule says origin is "always labelled"; this is the one
 * shared card every listing (shelves, search, categories) already
 * renders through, so labelling here covers all of them at once. Shown
 * only for `origin: "aptoide"` apps — first-party is the storefront's
 * implicit default, so an explicit "Zealot"/first-party tag on every
 * other card would just be noise, the same reasoning `is_editors_pick`
 * already uses for its own badge (rendered only when true, not a
 * "not an editors' pick" tag on everything else). Deliberately a
 * plain, neutral "Aptoide" tag. Superseded by `5.h.iii.zi`: the chip
 * now reads "Third-party (via Aptoide)" (`lib/trust.ts`), the wording
 * HANDOVER.md specifies. The detail page carries the fuller treatment
 * (download routing, no Verify block); the card only needs the label.
 *
 * Optional `caption` — leaf `3.b.iii.zo` (New & Updated chart page).
 * That chart's own ordering (`updated_at` descending) isn't a "rank" in
 * the sense installs are — recency isn't a competitive standing the way
 * a Top Free position is — so `rank` doesn't fit there (per that leaf's
 * own open question in HANDOVER.md). A one-line muted caption under the
 * rating row is the substitute: New & Updated passes "Updated <date>"
 * per app instead of a numbered badge, same "small optional addition to
 * the one existing card" shape `rank` already established rather than a
 * second bespoke chart-card component.
 */
export default function AppCard({
  app,
  rank,
  caption,
}: {
  app: App;
  rank?: number;
  caption?: string;
}) {
  return (
    <Link href={`/app/${app.slug}`} className={styles.card}>
      <div className={styles.icon}>
        {rank !== undefined && <span className={styles.rank}>{rank}</span>}
        <AppIcon
          name={app.name}
          primaryColor={app.primary_color}
          secondaryColor={app.secondary_color}
          tertiaryColor={app.tertiary_color}
          src={app.icon}
          sizes="(min-width: 1024px) 160px, (min-width: 768px) 20vw, (min-width: 480px) 30vw, 45vw"
        />
      </div>

      <div className={styles.info}>
        <p className={styles.name} title={app.name}>
          {app.name}
        </p>

        <p className={styles.meta}>
          <span className={styles.rating}>
            <span aria-hidden="true">★</span> {app.avg_rating.toFixed(1)}
          </span>
          {app.is_editors_pick && (
            <span className={styles.badge}>Editors&rsquo; Pick</span>
          )}
          {thirdPartyLabel(app) && (
            <span className={styles.origin}>{thirdPartyLabel(app)}</span>
          )}
        </p>

        {caption !== undefined && <p className={styles.caption}>{caption}</p>}
      </div>
    </Link>
  );
}
