import Link from "next/link";
import styles from "./CategoryFilters.module.css";

const SIZE_BUCKETS = [
  { label: "Any size", value: "" },
  { label: "Under 1 MB", value: "1" },
  { label: "Under 2 MB", value: "2" },
  { label: "Under 5 MB", value: "5" },
  { label: "Under 10 MB", value: "10" },
];

/**
 * Advanced filters — leaf 0.g.ii.zo (Search & Category Browse →
 * Category browse), extending the per-category page (`0.g.ii.zi`).
 *
 * A plain GET `<form>`, same "no-JS-required" convention as the
 * header's search bar (`SearchBar`'s underlying `<form>`) and the
 * `/search` page it submits to — filtering here works by reloading
 * `/categories/[slug]?license=...&maxSize=...`, not client-side state,
 * so the filtered result is a real, shareable/bookmarkable URL and
 * needs no JavaScript at all (unlike `SearchBar`, this leaf doesn't
 * even have a JS-only enhancement layered on top — there's no
 * "instant" version of this filter in scope here).
 *
 * `licenses` is the distinct set of licenses actually present in this
 * category (computed by the page from the category's *unfiltered* app
 * list), not the full list of licenses across the whole catalog — a
 * category with only GPL-3.0 apps shouldn't offer an Apache-2.0 option
 * that would always return zero results.
 *
 * Size is offered as fixed buckets (Under 1/2/5/10 MB) rather than a
 * free-form number input — every app in the mock dataset is under
 * 10MB, so buckets give a meaningful choice without asking the visitor
 * to guess a number; `getApps`'s `maxSizeMb` (lib/catalog.ts) takes
 * the bucket's numeric value directly.
 */
export default function CategoryFilters({
  categorySlug,
  licenses,
  selectedLicense,
  selectedMaxSize,
}: {
  categorySlug: string;
  licenses: string[];
  selectedLicense: string;
  selectedMaxSize: string;
}) {
  return (
    <form method="GET" className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>License</span>
        <select name="license" defaultValue={selectedLicense} className={styles.select}>
          <option value="">Any license</option>
          {licenses.map((license) => (
            <option key={license} value={license}>
              {license}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Size</span>
        <select name="maxSize" defaultValue={selectedMaxSize} className={styles.select}>
          {SIZE_BUCKETS.map((bucket) => (
            <option key={bucket.label} value={bucket.value}>
              {bucket.label}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" className={styles.submit}>
        Apply
      </button>
      {(selectedLicense || selectedMaxSize) && (
        <Link href={`/categories/${categorySlug}`} className={styles.clear}>
          Clear filters
        </Link>
      )}
    </form>
  );
}
