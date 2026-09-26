import { getSponsoredApps } from "@/lib/catalog";
import SponsoredAppsTable from "./SponsoredAppsTable";
import { requireAdminPage } from "@/lib/admin-auth";
import styles from "./page.module.css";

/**
 * Sponsored placement — leaf `3.c.i.zo` originally, **made read-only by
 * `5.j.ii.zi`**. Same shape as `app/admin/featuring/page.tsx` post-
 * `5.g.v.zi`: a plain, unthemed internal page (no `CategoryThemeScope`,
 * no storefront header/search nav — same reasoning as that page's own
 * comment), server-fetching the apps that currently carry a
 * `sponsored_slots` window and handing them to a read-only table.
 *
 * `SponsoredCard` (`components/SponsoredCard.tsx`) is what actually
 * renders sponsored placement on the storefront — see that component's
 * own comment for how it reads whichever app `getActiveSponsoredSlot`
 * says is active today.
 */
export default async function AdminSponsoredPage() {
  await requireAdminPage(); // 3.c.iv.zi — defence in depth behind middleware.ts
  const apps = await getSponsoredApps();

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Sponsored Placement</h1>
      <p className={styles.subheading}>
        Read-only. Sponsored placement windows are now authored in the
        Zealot Console and published in its signed catalog index —
        scheduling here was retired by leaf 5.j.ii.zi.
      </p>

      <SponsoredAppsTable apps={apps} />
    </main>
  );
}
