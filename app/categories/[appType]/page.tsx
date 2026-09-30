import { notFound, permanentRedirect } from "next/navigation";
import { LEGACY_SLUGS, toPlay } from "@/lib/taxonomy";

/**
 * Legacy category URLs — leaf `5.i.iv.zo`. `/categories/<legacy-slug>` was
 * the per-category page (`0.g.ii.zi`/`0.g.ii.zo`/`0.i.ii.zo`) before the
 * two-axis taxonomy; those URLs are indexed and bookmarked, so each of the
 * twelve legacy slugs now answers with a permanent redirect (308) to its
 * Play-model home, `/categories/<app_type>/<category>`, via `toPlay`
 * (`system` -> `/categories/app/tools`, `games` ->
 * `/categories/game/uncategorized`, ...). The query string (`license`,
 * `maxSize`, anything else) is carried over unchanged.
 *
 * Only the twelve legacy slugs redirect. Any other one-segment slug — a
 * vocabulary slug like `tools`, which was never a URL, or nonsense — is a
 * `notFound()`: guessing an `app_type` for a bare slug is exactly the
 * ambiguity (`sports`) the two-segment shape exists to remove.
 *
 * **This page is the fallback, not the mechanism.** The real 308s come from
 * `redirects()` in `next.config.mjs`, which runs before any page. A redirect
 * (or `notFound()`) thrown from here sat under `app/categories/loading.tsx`
 * when this was written (that file has since moved into the `(index)` route
 * group, unverified),
 * so the loading shell has already streamed a `200` by then: a `next start`
 * run showed every URL here answering 200, including nonsense slugs. Two
 * consequences, both open: a non-legacy slug shows the 404 UI with a 200
 * status (a soft 404) rather than a real 404, and the fix for that is a
 * different loading-boundary layout, not a change here.
 *
 * Deleted by `5.i.v.zo` only if the legacy URLs are ever allowed to 404;
 * until then this file is what keeps them working.
 */
export default async function LegacyCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ appType: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The folder is `[appType]`, not `[slug]`, because Next refuses two different
  // dynamic-segment names at the same position (`/categories/[slug]` next to
  // `/categories/[appType]/[slug]` is a 500 on every request under
  // `/categories`). For this one-segment URL the value is the legacy slug.
  const { appType: slug } = await params;
  if (!LEGACY_SLUGS.includes(slug)) {
    notFound();
  }

  const target = toPlay(slug);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value !== undefined) {
      query.append(key, value);
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";

  permanentRedirect(`/categories/${target.app_type}/${target.category}${suffix}`);
}
