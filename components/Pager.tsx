import Link from "next/link";
import styles from "./Pager.module.css";

/**
 * "Next page" link — leaf `5.l.x.zi`. A plain link (no JavaScript, crawlable) to the same page with
 * `after=<cursor>` set. There is no "previous" link and no page numbers: the catalog is read by
 * keyset, so it can only say what comes after a page; going back is the browser's back button.
 * Renders nothing on the last page (`nextCursor` is `null`).
 *
 * `params` are the other query parameters to keep (for example a future `n` or a filter); `after`
 * in `params` is ignored, the cursor wins.
 */
export default function Pager({
  basePath,
  nextCursor,
  params = {},
}: {
  basePath: string;
  nextCursor: string | null;
  params?: Readonly<Record<string, string | undefined>>;
}) {
  if (!nextCursor) return null;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== "after" && value !== undefined) query.set(key, value);
  }
  query.set("after", nextCursor);

  return (
    <nav className={styles.pager} aria-label="More apps">
      <Link href={`${basePath}?${query.toString()}`} className={styles.next} rel="next">
        Next page
      </Link>
    </nav>
  );
}
