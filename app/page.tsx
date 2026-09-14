import { getFeaturedApps, getTrendingApps } from "@/lib/catalog";
import Hero from "@/components/Hero";
import Shelf from "@/components/Shelf";

/**
 * Home page — leaf 0.d.i.zi wired in the hero, replacing the Phase 0
 * placeholder markup confirmed live at https://d-store-nu.vercel.app/
 * by 0.a.i.zo. 0.d.ii.zi added the Featured shelf below it, reusing the
 * same `getFeaturedApps()` call already made for the hero rather than a
 * second fetch — the hero takes the first result, the shelf renders the
 * rest so the hero's app isn't duplicated directly underneath it.
 *
 * This leaf (0.d.ii.zo) adds the Trending shelf below Featured, sorted
 * by dummy `install_count` — `getTrendingApps()` already returns that
 * order (see lib/catalog.ts), so no client-side re-sort is needed here.
 * Unlike Featured/hero, Trending is a separate fetch rather than a
 * slice of the same call: it's a distinct sort dimension (installs, not
 * the `is_featured` flag), so the two lists legitimately overlap rather
 * than partitioning one result set. Editor's Picks (0.d.iii.zi) lands
 * next and will stack below this shelf.
 */
export default async function Home() {
  const [featured, trending] = await Promise.all([getFeaturedApps(), getTrendingApps()]);
  const [heroApp, ...restFeatured] = featured;

  return (
    <main>
      {heroApp && <Hero app={heroApp} />}
      <Shelf title="Featured" apps={restFeatured} />
      <Shelf title="Trending" apps={trending} />
    </main>
  );
}
