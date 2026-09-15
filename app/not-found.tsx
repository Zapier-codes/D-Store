import EmptyState from "@/components/EmptyState";

/**
 * Global 404 page — leaf 3.a.iii.zo. Next.js renders this automatically
 * for any unmatched route, and it's also what fires whenever a page
 * calls `notFound()` for a valid-shaped but nonexistent slug — the app
 * detail page (`0.e.i.zi`), the category page (`0.g.ii.zi`), and the
 * developer profile page (`0.g.iii.zo`) all already call `notFound()`
 * on an unknown slug; before this leaf, that fell through to Next's
 * unstyled default 404, not this app's own design tokens.
 *
 * Plain server component — the "Back to home" link is a real `<Link>`,
 * no client state needed here (unlike `error.tsx`, which needs the
 * client-only `reset()` callback).
 */
export default function NotFound() {
  return (
    <main>
      <EmptyState
        kind="not-found"
        heading="Page not found"
        message="The page you're looking for doesn't exist, or may have moved."
        action={{ href: "/", label: "Back to home" }}
      />
    </main>
  );
}
