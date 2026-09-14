import type { App } from "@/lib/catalog";
import ShelfGrid from "./ShelfGrid";
import AppCard from "./AppCard";
import styles from "./Shelf.module.css";

/**
 * Titled shelf — leaf 0.d.ii.zi (Home Page → Shelves → Featured shelf).
 *
 * A shelf is a heading plus a `ShelfGrid` (0.c.ii.zi) of `AppCard`s
 * (0.c.ii.zo) — the repeating unit the home page stacks (Featured here,
 * then Trending in 0.d.ii.zo, Editor's Picks in 0.d.iii.zi). Pulled out
 * as its own component rather than inlined in `app/page.tsx` so those
 * next leaves reuse this instead of re-deriving the title+grid markup.
 *
 * Renders nothing when `apps` is empty (e.g. a future region filter,
 * 0.h.ii.zo, narrows a shelf to zero results) rather than showing an
 * empty heading.
 */
export default function Shelf({ title, apps }: { title: string; apps: App[] }) {
  if (apps.length === 0) return null;

  return (
    <section className={styles.shelf} aria-labelledby={`shelf-${slugify(title)}`}>
      <h2 id={`shelf-${slugify(title)}`} className={styles.title}>
        {title}
      </h2>
      <ShelfGrid>
        {apps.map((app) => (
          <AppCard key={app.slug} app={app} />
        ))}
      </ShelfGrid>
    </section>
  );
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
