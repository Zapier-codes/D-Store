import { getFeaturedApps, getTrendingApps, getEditorsPicks } from "@/lib/catalog";
import Hero from "@/components/Hero";
import Shelf from "@/components/Shelf";
import SponsoredCard from "@/components/SponsoredCard";
import ScrollReveal from "@/components/ScrollReveal";

/**
 * Home page — leaf 0.d.i.zi wired in the hero, replacing the Phase 0
 * placeholder markup confirmed live at https://d-store-nu.vercel.app/
 * by 0.a.i.zo. 0.d.ii.zi added the Featured shelf below it, reusing the
 * same `getFeaturedApps()` call already made for the hero rather than a
 * second fetch — the hero takes the first result, the shelf renders the
 * rest so the hero's app isn't duplicated directly underneath it.
 *
 * 0.d.ii.zo added the Trending shelf below Featured, sorted by dummy
 * `install_count` — `getTrendingApps()` already returns that order (see
 * lib/catalog.ts), so no client-side re-sort is needed there. Trending
 * is a separate fetch rather than a slice of the Featured result: it's
 * a distinct sort dimension (installs, not the `is_featured` flag), so
 * the two lists legitimately overlap rather than partitioning one
 * result set.
 *
 * `3.b.ii.zo` later re-sorted `getTrendingApps` onto `view_count`
 * (matching docs/D-STORE.md §4E's "View counters (powers Trending)")
 * and made it read from a lazily-refreshed daily snapshot rather than
 * a live sort on every call — nothing changes at this call site either
 * way, same seam-stability every `lib/catalog.ts` swap has had so far.
 *
 * This leaf (0.d.iii.zi) adds the Editor's Picks shelf below Trending,
 * from `getEditorsPicks()` — filtered on the dummy `is_editors_pick`
 * flag (see lib/catalog.ts), a third independent dimension from both
 * `is_featured` and `install_count`, so it's fetched separately rather
 * than derived from either existing list. Individual cards already
 * surface an "Editors' Pick" badge (AppCard, 0.c.ii.zo) when an app
 * appears in one of the other shelves too — this shelf is the
 * dedicated, curated collection of just those apps.
 *
 * 0.d.iii.zo adds the sponsored card slot (`SponsoredCard`) as the
 * Editor's Picks shelf's `extraSlot` — a dummy/native placeholder,
 * styled like an organic card and clearly labeled "Sponsored" per
 * docs/D-STORE.md §6, woven in after the curated picks rather than
 * replacing or reordering any of them.
 *
 * 3.a.i.zo wraps the hero and each shelf in `ScrollReveal`
 * (`components/ScrollReveal.tsx`, built in `3.a.i.zi`) — per that
 * utility's own header comment, this is "every shelf/hero it
 * eventually wraps." `ScrollReveal` only takes `children`, so `Hero`
 * and `Shelf` stay exactly as they were (still server components,
 * still rendered server-side) — they're just composed as children of
 * the client wrapper here, the standard Next.js pattern for adding a
 * client-only concern (the `IntersectionObserver` in
 * `useScrollReveal`) around server-rendered content without
 * converting that content into a client component itself. The hero
 * keeps its own separate 0.d.i.zo mount animation in
 * `Hero.module.css` — `ScrollReveal` fires immediately for it since
 * it's already in the viewport on first paint, so the two don't
 * conflict, just layer (mount animation, then no further scroll
 * transition since it never leaves/re-enters view).
 */
export default async function Home() {
  const [featured, trending, editorsPicks] = await Promise.all([
    getFeaturedApps(),
    getTrendingApps(),
    getEditorsPicks(),
  ]);
  const [heroApp, ...restFeatured] = featured;

  return (
    <main>
      {heroApp && (
        <ScrollReveal>
          <Hero app={heroApp} />
        </ScrollReveal>
      )}
      <ScrollReveal>
        <Shelf title="Featured" apps={restFeatured} />
      </ScrollReveal>
      <ScrollReveal>
        <Shelf title="Trending" apps={trending} />
      </ScrollReveal>
      <ScrollReveal>
        <Shelf
          title="Editor's Picks"
          apps={editorsPicks}
          extraSlot={<SponsoredCard />}
        />
      </ScrollReveal>
    </main>
  );
}
