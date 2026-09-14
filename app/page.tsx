import { getFeaturedApps } from "@/lib/catalog";
import Hero from "@/components/Hero";

/**
 * Home page — leaf 0.d.i.zi wires in the first real screen (the hero),
 * replacing the Phase 0 placeholder markup confirmed live at
 * https://d-store-nu.vercel.app/ by 0.a.i.zo. Shelves (0.d.ii) and
 * editorial slots (0.d.iii) land in the leaves that follow and will
 * render below the hero here.
 */
export default async function Home() {
  const featured = await getFeaturedApps();
  const heroApp = featured[0];

  return (
    <main>
      {heroApp && <Hero app={heroApp} />}
    </main>
  );
}
