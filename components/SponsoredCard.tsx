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
 * This is a dummy/native placeholder, not a real ad unit: there is no
 * ad network integration, no real creative, and no click-through yet.
 * `App`-shaped dummy content lives inline here (name/summary/colors)
 * rather than in `lib/mock-data.ts`/`lib/catalog.ts`, since a sponsored
 * slot isn't a catalog app — it doesn't have a slug, detail page, or
 * rating, and mixing it into the real `App[]` dataset would leak a
 * fake app into search/category/trending logic that all read from
 * that same array. Wiring a real ad slot (network, targeting, a
 * click-through target) is future/real-backend work, not this leaf.
 *
 * Placement: rendered by `app/page.tsx` as an extra child passed into
 * the Editor's Picks `Shelf` via its new `extraSlot` prop (see
 * `Shelf.tsx`), landing after the curated picks rather than before —
 * so it reads as "woven into" the listing, not interrupting the
 * curated order those apps were fetched in.
 */
export default function SponsoredCard() {
  return (
    <div className={styles.card} aria-label="Sponsored">
      <div className={styles.icon}>
        <AppIcon
          name="Sponsored"
          primaryColor="var(--color-accent)"
          secondaryColor="var(--color-accent-strong)"
          tertiaryColor="var(--color-surface)"
        />
      </div>

      <div className={styles.info}>
        <p className={styles.name}>Your app could be here</p>

        <p className={styles.meta}>
          <span className={styles.badge}>Sponsored</span>
        </p>
      </div>
    </div>
  );
}
