import SkeletonHero from "@/components/SkeletonHero";
import SkeletonShelf from "@/components/SkeletonShelf";

/**
 * Home page loading skeleton — leaf 3.a.iii.zi. Next.js's automatic
 * per-route-segment Suspense boundary renders this while `app/page.tsx`
 * (an async server component) awaits `getFeaturedApps`/`getTrendingApps`/
 * `getEditorsPicks` — exactly the "loading states can be built against
 * [the simulated latency] now" case `lib/catalog.ts`'s own header
 * comment calls out. No wiring needed beyond this file existing at the
 * route root — that's the whole point of the App Router convention.
 *
 * Mirrors `app/page.tsx`'s real shape (hero, then three shelves) so
 * there's no layout jump when real content swaps in. `role="status"`
 * wraps the whole thing so a screen reader announces "Loading" once,
 * not once per shimmering block underneath (each of which is
 * `aria-hidden`, see `SkeletonBlock`).
 */
export default function Loading() {
  return (
    <main role="status" aria-label="Loading">
      <SkeletonHero />
      <SkeletonShelf />
      <SkeletonShelf />
      <SkeletonShelf />
    </main>
  );
}
