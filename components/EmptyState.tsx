import Link from "next/link";
import styles from "./EmptyState.module.css";

type EmptyStateKind = "search" | "filter" | "error" | "not-found";

const ICONS: Record<EmptyStateKind, React.ReactNode> = {
  // Magnifying glass — no results for a query.
  search: (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="21" cy="21" r="13" stroke="currentColor" strokeWidth="3" />
      <line x1="30.5" y1="30.5" x2="41" y2="41" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ),
  // Empty tray — nothing matches the current filters/category.
  filter: (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M6 14h36l-4 22a3 3 0 0 1-3 2.5H13a3 3 0 0 1-3-2.5L6 14Z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M6 14 12 6h24l6 8" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  ),
  // Triangle-exclamation — something went wrong.
  error: (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M24 6 45 40H3L24 6Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <line x1="24" y1="20" x2="24" y2="29" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="34.5" r="1.75" fill="currentColor" />
    </svg>
  ),
  // Compass — nothing at this address.
  "not-found": (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="3" />
      <path d="m29 19-8 5-2 8 8-5 2-8Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  ),
};

/**
 * EmptyState — leaf 3.a.iii.zo (Loading states → Empty/error/404 state
 * designs), the counterpart `3.a.iii.zi`'s skeletons left open: skeletons
 * cover the *waiting* moment, this covers the *nothing/wrong* moment —
 * zero search results, a filtered-out category, a thrown error, and an
 * unknown route.
 *
 * One shared component rather than four bespoke ones, matching this
 * repo's existing "one primitive, several call sites" pattern
 * (`SkeletonBlock`, `3.a.iii.zi`; `Shelf`/`ShelfGrid`, `0.d.ii.zi`).
 * The icon is a plain inline SVG stroked in `currentColor` — same
 * "no external image assets" convention every other visual in this
 * repo already follows (colored-tile app icons, CSS-only screenshot
 * placeholders) — sized and colored entirely from the `0.b` tokens, so
 * it re-themes for free across dark/light without an image to swap.
 *
 * Pure server component: the two places that actually need
 * interactivity — `error.tsx`'s "Try again" (needs the client-only
 * `reset()` callback) and any future retry affordance — pass it in via
 * `action`, rather than this component owning any client-side state
 * itself. `not-found.tsx`'s "Back to home" link works the same way,
 * just as a plain server-rendered `<Link>` instead.
 */
export default function EmptyState({
  kind,
  heading,
  message,
  action,
}: {
  kind: EmptyStateKind;
  heading: string;
  message: string;
  action?: { href: string; label: string } | React.ReactNode;
}) {
  return (
    <div className={styles.wrapper} role={kind === "error" ? "alert" : undefined}>
      <div className={styles.icon}>{ICONS[kind]}</div>
      <h2 className={styles.heading}>{heading}</h2>
      <p className={styles.message}>{message}</p>
      {action &&
        (typeof action === "object" && action !== null && "href" in action ? (
          <Link href={action.href} className={styles.action}>
            {action.label}
          </Link>
        ) : (
          action
        ))}
    </div>
  );
}
