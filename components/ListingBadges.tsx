import type { ListingBadge } from "@/lib/play-ports";
import styles from "./ListingBadges.module.css";

/**
 * Card D-P1 — the listing badges, drawn next to the header pills. Pure presentation: it renders exactly the
 * badges `badgesFor` returned and nothing when the list is empty, so no app shows an invented flag.
 */
export default function ListingBadges({ badges }: { badges: ListingBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <ul className={styles.row} aria-label="Listing badges">
      {badges.map((badge) => (
        <li key={badge.id} className={styles.badge} data-badge={badge.id}>
          {badge.label}
        </li>
      ))}
    </ul>
  );
}
