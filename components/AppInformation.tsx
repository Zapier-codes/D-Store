import Link from "next/link";
import type { App } from "@/lib/catalog";
import { infoRowsFor } from "@/lib/app-facts";
import styles from "./AppInformation.module.css";

/**
 * The details page's Information list: operator-directed 2026-10-08, slice 2 of the rework in
 * docs/DETAIL-PAGE-REWORK-PROMPT.md (section 5D); the idea is Apple's, drawn as a glass list.
 *
 * A heading and a definition list: Developer, Category, Size, Version, Updated, Requires Android, License and
 * Content rating, in that order, each row only when the source provided the value (`infoRowsFor`,
 * lib/app-facts.ts). There is never a "Not provided" row, and a list with no rows renders nothing at all, so
 * no empty heading is left behind. No source name and no third-party wording. Server component.
 */
export default function AppInformation({
  app,
  developer,
  developerName,
  categoryName,
}: {
  app: App;
  developer: { slug: string; name: string } | null;
  developerName: string | null;
  categoryName: string | null;
}) {
  const rows = infoRowsFor(app, { developer, developerName, categoryName });
  if (rows.length === 0) return null;

  return (
    <section className={styles.root} aria-labelledby="information-heading">
      <h2 id="information-heading" className={styles.title}>
        Information
      </h2>
      <dl className={styles.list}>
        {rows.map((row) => (
          <div key={row.id} className={styles.row}>
            <dt className={styles.label}>{row.label}</dt>
            <dd className={styles.value}>
              {row.href ? (
                <Link href={row.href} className={styles.link}>
                  {row.value}
                </Link>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
