import type { App } from "@/lib/catalog";
import { dataSafetyRowsFor } from "@/lib/app-facts";
import styles from "./DataSafety.module.css";

/**
 * Card D-P5 — the Data Safety panel, Play's "what data the app collects and whether it's shared", distinct
 * from Permissions (what the APK requests). Storeapp models the same shape (`DataSafetyInfo` here); this is
 * the reader the web was missing.
 *
 * The component owns its section and heading and renders nothing when the source provided no such section
 * (`data_safety.provided === false`): an empty panel would falsely read as "collects nothing", which is a
 * different claim from "unknown". A provided section prints each answer, including an honest "No".
 * Server component.
 */
export default function DataSafety({ app }: { app: Pick<App, "data_safety"> }) {
  const rows = dataSafetyRowsFor(app);
  if (rows.length === 0) return null;

  return (
    <section className={styles.root} aria-labelledby="data-safety-heading">
      <h2 id="data-safety-heading" className={styles.title}>
        Data safety
      </h2>
      <dl className={styles.list}>
        {rows.map((row) => (
          <div key={row.question} className={styles.row}>
            <dt className={styles.question}>{row.question}</dt>
            <dd className={styles.answer}>{row.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
