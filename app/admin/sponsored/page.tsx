import { getSponsoredSlots } from "@/lib/catalog";
import SponsoredSlotsPanel from "./SponsoredSlotsPanel";
import { requireAdminPage } from "@/lib/admin-auth";
import styles from "./page.module.css";

/**
 * Sponsored-slot scheduling tool — leaf `3.c.i.zo`, the second leaf of
 * `3.c.i` (Featuring). Same shape as `app/admin/featuring/page.tsx`
 * (`3.c.i.zi`): a plain, unthemed internal page (no
 * `CategoryThemeScope`, no storefront header/search nav — same
 * reasoning as that page's own comment), server-fetching the initial
 * data via `getSponsoredSlots()` and handing it to a client component
 * for the interactive scheduling form + list.
 *
 * `SponsoredCard` (`components/SponsoredCard.tsx`) is what this tool
 * actually controls — see that component's own comment for how it
 * reads whichever slot `getActiveSponsoredSlot` says is active today.
 */
export default async function AdminSponsoredPage() {
  await requireAdminPage(); // 3.c.iv.zi — defence in depth behind middleware.ts
  const slots = await getSponsoredSlots();

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Sponsored Slot Scheduling</h1>
      <p className={styles.subheading}>
        Schedule which sponsored creative appears in the storefront&rsquo;s
        Sponsored card. Only one slot renders on any given day — see the
        note below if two windows overlap.
      </p>

      <SponsoredSlotsPanel initialSlots={slots} />
    </main>
  );
}
