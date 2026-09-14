import { getFeaturedApps } from "@/lib/catalog";
import Hero from "@/components/Hero";
import Shelf from "@/components/Shelf";

/**
 * Home page — leaf 0.d.i.zi wired in the hero, replacing the Phase 0
 * placeholder markup confirmed live at https://d-store-nu.vercel.app/
 * by 0.a.i.zo. This leaf (0.d.ii.zi) adds the Featured shelf below it,
 * reusing the same `getFeaturedApps()` call already made for the hero
 * rather than a second fetch — the hero takes the first result, the
 * shelf renders the rest so the hero's app isn't duplicated directly
 * underneath it. Trending (0.d.ii.zo) and Editor's Picks (0.d.iii.zi)
 * land in the leaves that follow and will stack below this shelf.
 */
export default async function Home() {
  const featured = await getFeaturedApps();
  const [heroApp, ...restFeatured] = featured;

  return (
    <main>
      {heroApp && <Hero app={heroApp} />}
      <Shelf title="Featured" apps={restFeatured} />
    </main>
  );
}
