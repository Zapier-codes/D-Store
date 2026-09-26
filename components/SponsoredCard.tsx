import Link from "next/link";
import { getActiveSponsoredSlot } from "@/lib/catalog";
import AppIcon from "./AppIcon";
import styles from "./SponsoredCard.module.css";

/**
 * Sponsored card slot — leaf 0.d.iii.zo (Home Page → Editorial).
 *
 * Per docs/D-STORE.md §1/§6: "native 'Sponsored' cards woven into
 * listings rather than interstitials" / "styled like organic cards,
 * clearly labeled." This mirrors `AppCard`'s markup and CSS custom
 * properties one-for-one (icon tile, clamped name, meta line) so it
 * sits in a `ShelfGrid` indistinguishably in *shape* from a real
 * `AppCard` — the only visual difference is the `Sponsored` label
 * replacing the rating, which is the "clearly labeled" requirement.
 *
 * Originally a dummy/native placeholder with no real creative and no
 * click-through: `App`-shaped content lived inline here rather than in
 * `lib/mock-data.ts`, since a sponsored slot wasn't a catalog app.
 * **Leaf `5.j.ii.zi` retires that**: per the cross-repo "sponsored
 * placement" decision, real Play-Store-style sponsored placement uses
 * the app's own listing as the creative, not separate ad copy — so
 * this now renders a real catalog `App` (icon, name, summary, and a
 * real click-through to its detail page) whenever one has an active
 * `sponsored_slots` window, instead of a fake unlinkable stand-in.
 *
 * Placement: rendered by `app/page.tsx` as an extra child passed into
 * the Editor's Picks `Shelf` via its new `extraSlot` prop (see
 * `Shelf.tsx`), landing after the curated picks rather than before —
 * so it reads as "woven into" the listing, not interrupting the
 * curated order those apps were fetched in.
 *
 * `getActiveSponsoredSlot` (`lib/catalog.ts`) now returns the `App`
 * itself, sourced from whatever window the Console (Zealot) published
 * in its signed index (`5.j.i.zo` — this repo authors nothing locally
 * anymore, see `/admin/sponsored`'s read-only successor). No app with
 * an active window falls back to the original static "Your app could
 * be here" placeholder, unchanged. Making this component `async` (it
 * wasn't before `3.c.i.zo`) is safe at its one call site: `app/page.tsx`
 * is itself an async server component already awaiting sibling catalog
 * calls, and Next's App Router renders async server components as
 * children the same way as sync ones.
 */
export default async function SponsoredCard() {
  const activeApp = await getActiveSponsoredSlot();
  const name = activeApp?.name ?? "Your app could be here";
  const summary = activeApp?.summary;

  const content = (
    <>
      <div className={styles.icon}>
        <AppIcon
          name={name}
          primaryColor={activeApp?.primary_color ?? "var(--color-accent)"}
          secondaryColor={activeApp?.secondary_color ?? "var(--color-accent-strong)"}
          tertiaryColor={activeApp?.tertiary_color ?? "var(--color-surface)"}
        />
      </div>

      <div className={styles.info}>
        <p className={styles.name}>{name}</p>
        {summary && <p className={styles.caption}>{summary}</p>}

        <p className={styles.meta}>
          <span className={styles.badge}>Sponsored</span>
        </p>
      </div>
    </>
  );

  if (activeApp) {
    return (
      <Link href={`/app/${activeApp.slug}`} className={styles.card} aria-label={`Sponsored: ${name}`}>
        {content}
      </Link>
    );
  }

  return (
    <div className={styles.card} aria-label="Sponsored">
      {content}
    </div>
  );
}
