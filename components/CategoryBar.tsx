import Link from "next/link";
import CategoryIcon from "./CategoryIcon";
import styles from "./CategoryBar.module.css";

/**
 * Category bar — leaf `5.l.ix.zo`. A row of links to category pages, scrolling sideways when it
 * does not fit, ending with a link to every category. Renders nothing for an empty list, so the
 * home page looks as it did before any app has a category.
 */
export default function CategoryBar({
  items,
}: {
  items: readonly { title: string; href: string; icon: string }[];
}) {
  if (items.length === 0) return null;

  return (
    <nav className={styles.bar} aria-label="Browse by category">
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={styles.chip}>
              <CategoryIcon icon={item.icon} className={styles.glyph} />
              <span>{item.title}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/categories" className={styles.chip}>
            <span>All categories</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
