import { notFound } from "next/navigation";
import { getCollectionBySlug, getCollectionApps } from "@/lib/catalog";
import ShelfGrid from "@/components/ShelfGrid";
import AppCard from "@/components/AppCard";
import EmptyState from "@/components/EmptyState";
import styles from "./page.module.css";

/**
 * Per-collection apps listing — leaf `4.c.ii.zo`, created alongside
 * the `/collections` index (see that page's header comment for why
 * both land in one leaf — same pattern `0.g.ii.zi` used for
 * `/categories`). `notFound()` on an unknown slug, same convention
 * every other `[slug]` route here already follows (`/app/[slug]`,
 * `/categories/[slug]`, `/developer/[slug]`).
 *
 * No filters here unlike `/categories/[slug]` (`0.g.ii.zo`) — a
 * collection is a small, hand-curated list by definition, not a large
 * browsable set that needs narrowing. The `EmptyState` branch exists
 * for a real, current possibility since `5.j.ii.zo`: collection
 * membership (`App.collections`) is a first-party-only Console field,
 * so a collection with no Zealot-origin apps in it yet — or none at
 * all — renders empty rather than erroring.
 */
export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);

  if (!collection) {
    notFound();
  }

  const apps = await getCollectionApps(slug);

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>{collection.name}</h1>
      <p className={styles.description}>{collection.description}</p>

      {apps.length === 0 ? (
        <EmptyState kind="filter" heading="No apps right now" message="This collection has no apps in the catalog at the moment." />
      ) : (
        <ShelfGrid>
          {apps.map((app) => (
            <AppCard key={app.slug} app={app} />
          ))}
        </ShelfGrid>
      )}
    </main>
  );
}
