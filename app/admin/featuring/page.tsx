import { getApps } from "@/lib/catalog";
import FeaturingTable from "./FeaturingTable";
import { requireAdminPage } from "@/lib/admin-auth";
import styles from "./page.module.css";

/**
 * Admin toggle for `is_featured`/`is_editors_pick` — leaf `3.c.i.zi`,
 * the first leaf of `3.c` (Admin/Editorial Tools). Deliberately plain
 * rather than themed: this is an internal tool, not a storefront page,
 * so it doesn't wrap in `CategoryThemeScope` or reuse the public
 * header/search nav the way every `app/**` page under the storefront
 * does — same reasoning `2.b.iii.zo`'s standalone admin Twig template
 * gave for skipping `base.html.twig` on the legacy Symfony side.
 *
 * Fetches the full catalog once on the server via `getApps()` (no
 * options — every app, unfiltered) and hands it to `FeaturingTable`, a
 * client component, for the actual toggle interactions; see that
 * file's comment for why the mutation itself needs to live
 * client-side.
 */
export default async function AdminFeaturingPage() {
  await requireAdminPage(); // 3.c.iv.zi — defence in depth behind middleware.ts
  const apps = await getApps();

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Featuring</h1>
      <p className={styles.subheading}>
        Toggle which apps appear in the Featured and Editors&rsquo; Picks
        home page shelves.
      </p>

      <FeaturingTable apps={apps} />
    </main>
  );
}
