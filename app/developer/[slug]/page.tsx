import { notFound } from "next/navigation";
import { getDeveloperBySlug, getAppsByDeveloper } from "@/lib/catalog";
import Shelf from "@/components/Shelf";
import styles from "./page.module.css";

/**
 * Developer profile page — leaf 0.g.iii.zo (Search & Category Browse →
 * Related content → developer profile pages, per docs/D-STORE.md
 * line 35's feature list). Route is `/developer/[slug]`, singular —
 * there's no developer *index* page in scope here (nothing asked for
 * one, and D-STORE.md only calls out the profile pages themselves),
 * same singular-route reasoning `/app/[slug]` (0.e.i.zi) already used.
 *
 * Reachable from `/app/[slug]` (this leaf also adds a "by {developer}"
 * credit line there, linking here) — every route built so far has
 * needed an actual link pointing at it rather than being orphaned, and
 * without that edit this page would have no way in.
 *
 * `notFound()` on an unknown slug, same convention as `/app/[slug]`
 * and `/categories/[slug]`.
 *
 * `Developer` is a genuinely new concept for Phase 0 (the legacy
 * `Application` entity has no author field, and it's not in §7's field
 * list either) — see the header comment on `Developer` in
 * `lib/mock-data.ts` for what's real (slug/name/profile_url, read off
 * each app's actual `source` repo URL) versus dummy (bio, joined_at).
 *
 * The app list below reuses `Shelf` (0.d.ii.zi) directly, same as the
 * "Similar Apps" rail on the detail page (0.g.iii.zi) — every developer
 * here has at least one app by construction (`developer_slug` is
 * derived from real per-app data), so `Shelf`'s empty-array early
 * return never actually fires, but reusing it keeps this consistent
 * with how the rest of the catalog renders an app grid rather than
 * re-deriving a second grid layout for a case that can't occur.
 */
export default async function DeveloperPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const developer = await getDeveloperBySlug(slug);

  if (!developer) {
    notFound();
  }

  const apps = await getAppsByDeveloper(slug);
  const initial = developer.name.trim().charAt(0).toUpperCase();
  const joinedYear = new Date(developer.joined_at).getFullYear();

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.avatar} aria-hidden="true">
          {initial}
        </div>
        <div>
          <h1 className={styles.name}>{developer.name}</h1>
          <p className={styles.meta}>
            {apps.length} {apps.length === 1 ? "app" : "apps"} · Joined {joinedYear}
          </p>
        </div>
      </header>

      <p className={styles.bio}>{developer.bio}</p>

      <a href={developer.profile_url} className={styles.profileLink} target="_blank" rel="noopener noreferrer">
        View profile ↗
      </a>

      <Shelf title={`Apps by ${developer.name}`} apps={apps} />
    </main>
  );
}
