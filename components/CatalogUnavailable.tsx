import styles from "./CatalogUnavailable.module.css";

/**
 * "Temporarily unavailable" notice — leaf `5.l.xx.zo`. Shown under the first-party apps on a list page
 * when the catalog table could not be read (`CatalogUnavailableError`, `lib/catalog-errors.ts`), in
 * place of the rest of the list and its pager. Used by `/charts/top-free`, `/charts/new` and `/apps`;
 * the category page (`5.l.xxi.zi`) and search (`5.l.xxi.zo`) reuse it, so the props are generic: a
 * heading and a message, nothing about charts.
 *
 * The same look as `EmptyState` (the `error` triangle, the accent colour, the same tokens), but
 * compact and inline: it sits below a list that may still have first-party apps in it, so it has no
 * tall padding and no action. `role="status"` rather than `alert`, because the page is already showing
 * something useful and the notice should not interrupt a screen reader mid-list.
 *
 * Pure server component, no state, no query, no URL, no error text: what failed is one fixed line in the
 * server log and nothing about it reaches the page.
 */
export default function CatalogUnavailable({ heading, message }: { heading: string; message: string }) {
  return (
    <div className={styles.notice} role="status">
      <div className={styles.icon} aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <path d="M24 6 45 40H3L24 6Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          <line x1="24" y1="20" x2="24" y2="29" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <circle cx="24" cy="34.5" r="1.75" fill="currentColor" />
        </svg>
      </div>
      <h2 className={styles.heading}>{heading}</h2>
      <p className={styles.message}>{message}</p>
    </div>
  );
}
