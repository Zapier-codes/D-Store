import { getAllAppsPage, getTopFreeApps } from "@/lib/catalog";
import ShelfGrid from "@/components/ShelfGrid";
import AppCard from "@/components/AppCard";
import Pager from "@/components/Pager";
import styles from "./page.module.css";

/**
 * All apps page — leaf `5.l.xi.zo`. Every app and game in one flat list, most downloaded first,
 * with no ranks and no sections; the route is `/apps` and the link to it is on the `/categories`
 * index. (Not `/app`, which is the detail route's prefix, `/app/<slug>`.)
 *
 * Paged in table mode. With the Supabase env set the list is read one page at a time
 * (`getAllAppsPage`, 24 a page, order `top`): page 1 is the first-party apps (ranked by D-Store
 * installs) and then the first third-party rows (reported downloads, then slug); later pages are
 * third-party only, reached by the "Next page" link (`?after=<cursor>`). The catalog is read by
 * keyset, so there are no page numbers and no total, and going back is the browser's back button.
 *
 * With the table off, or when a page read fails, there is nothing paged to read, so the page shows
 * the whole merged list (`getTopFreeApps()`, the same order the table path produces) with no
 * `after` and no pager, as the two chart pages do. That fallback is the whole catalog in memory,
 * which is what the table mode exists to avoid, so a deployment with a large catalog should set
 * the Supabase env (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
 */
export default async function AllAppsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const page = await getAllAppsPage(query.after);
  const apps = page ? page.apps : await getTopFreeApps();

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>All apps</h1>
      <p className={styles.subheading}>Every app and game on D-Store, most downloaded first.</p>

      <ShelfGrid>
        {apps.map((app) => (
          <AppCard key={app.slug} app={app} />
        ))}
      </ShelfGrid>

      <Pager basePath="/apps" nextCursor={page ? page.nextCursor : null} />
    </main>
  );
}
