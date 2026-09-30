import styles from "./ThirdPartyNotice.module.css";

/**
 * "Third-party (via Aptoide)" trust label + one-line explanation —
 * leaf `5.h.iii.zi`, detail page only (cards carry the label text
 * alone, in `AppCard`). Replaces what first-party apps show in the
 * "Verify this APK" section: a third-party app has no org signing
 * fingerprint or D-Store-computed checksum to verify against, so the
 * page says so plainly instead of rendering an empty or invented block.
 */
export function ThirdPartyBadge({ label }: { label: string }) {
  return <span className={styles.badge}>{label}</span>;
}

export default function ThirdPartyNotice({ sourceName, scanRank }: { sourceName: string; scanRank?: string }) {
  return (
    <>
      <p className={styles.notice}>
        This app is listed from a third-party catalog. The file is delivered by {sourceName}, not
        by D-Store, and hasn&rsquo;t been verified by us.
      </p>
      {scanRank && (
        <p className={styles.notice}>
          {sourceName}&rsquo;s own malware scan reports: {scanRank}. This is {sourceName}&rsquo;s
          result, not a check by D-Store.
        </p>
      )}
    </>
  );
}
