import { CatalogUnavailableError, getAllAppsPage, getTopFreeApps, type AllAppsPage as AllAppsPageData } from "@/lib/catalog";
import ShelfGrid from "@/components/ShelfGrid";
import AppCard from "@/components/AppCard";
import Pager from "@/components/Pager";
import CatalogUnavailable from "@/components/CatalogUnavailable";
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
 * When the catalog cannot be read — leaf `5.l.xx.zo`. `getAllAppsPage` throws
 * `CatalogUnavailableError` (an unusable Supabase env counts: set `SUPABASE_URL` and
 * `SUPABASE_SERVICE_ROLE_KEY`) and this page catches only that error: it shows the first-party apps
 * (`getTopFreeApps()` is first-party only now) and then the shared "temporarily unavailable" notice,
 * with no pager. The whole-list fallback is gone. Any other error is not caught and reaches
 * `app/error.tsx`. HTTP status: this route sits under the root `app/loading.tsx`, so streaming sends
 * `200` before the read is known; the notice is what tells a visitor (and a crawler that reads the
 * body) the list is partial. A `503` cannot be set from here once the response has started, so none
 * is claimed.
 */
export default async function AllAppsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  let page: AllAppsPageData | null = null;
  try {
    page = await getAllAppsPage(query.after);
  } catch (error) {
    if (!(error instanceof CatalogUnavailableError)) throw error;
  }
  const apps = page ? page.apps : await getTopFreeApps();

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>All apps</h1>
      <p className={styles.subheading}>Every app and game on D-Store, most downloaded first.</p>

      {(page !== null || apps.length > 0) && (
        <ShelfGrid>
          {apps.map((app) => (
            <AppCard key={app.slug} app={app} />
          ))}
        </ShelfGrid>
      )}

      {page === null && (
        <CatalogUnavailable
          heading="The rest of this list is temporarily unavailable"
          message="We could not load all apps just now. Please try again in a few minutes."
        />
      )}

      <Pager basePath="/apps" nextCursor={page ? page.nextCursor : null} />
    </main>
  );
}
