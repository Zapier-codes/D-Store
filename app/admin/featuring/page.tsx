import { getApps } from "@/lib/catalog";
import FeaturingTable from "./FeaturingTable";
import { requireAdminPage } from "@/lib/admin-auth";
import styles from "./page.module.css";

/**
 * Read-only view of `is_featured`/`is_editors_pick` — leaf `3.c.i.zi`
 * originally, **made read-only by `5.g.v.zi`**. Deliberately plain
 * rather than themed: this is an internal tool, not a storefront page,
 * so it doesn't wrap in `CategoryThemeScope` or reuse the public
 * header/search nav the way every `app/**` page under the storefront
 * does — same reasoning `2.b.iii.zo`'s standalone admin Twig template
 * gave for skipping `base.html.twig` on the legacy Symfony side.
 *
 * Fetches the full catalog once on the server via `getApps()` (no
 * options — every app, unfiltered) and hands it to `FeaturingTable`,
 * now a plain server-rendered display: featured/Editors' Pick are
 * sourced from the Console's signed index (`lib/sources/zealot.ts`),
 * not a local toggle, per `5.g.v.zi`'s "this repo stays write-free on
 * the editorial side."
 */
export default async function AdminFeaturingPage() {
  await requireAdminPage(); // 3.c.iv.zi — defence in depth behind middleware.ts
  const apps = await getApps();

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Featuring</h1>
      <p className={styles.subheading}>
        Read-only. Featured and Editors&rsquo; Picks are now set in the
        Zealot Console and published in its signed catalog index —
        toggling here was retired by leaf 5.g.v.zi.
      </p>

      <FeaturingTable apps={apps} />
    </main>
  );
}
