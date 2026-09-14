"use client";

import { useState } from "react";
import styles from "./SignatureInfo.module.css";

/**
 * Digital signature info display — leaf 0.f.i.zo (App Detail Page →
 * APK verification), second piece of "Verify this APK" alongside
 * ChecksumDisplay (0.f.i.zi).
 *
 * Distinct from the checksum: `sha256_checksum` (0.f.i.zi) hashes the
 * APK file itself, while this shows who signed it — the code-signing
 * certificate's SHA-256 fingerprint, `App.signing_certificate_fingerprint`
 * (lib/mock-data.ts, added by this leaf, beyond docs/D-STORE.md §7's
 * original field list — a dummy value, not a real digest, same
 * treatment as the checksum).
 *
 * Signature scheme is shown as a fixed label — "APK Signature Scheme v1
 * (JAR signing)" — for every app rather than a per-app field, since
 * every app in this catalog is a real Fossdroid-era app from
 * 2011–2016 (lib/mock-data.ts header), and APK Signature Scheme v2
 * wasn't introduced until Android 7.0 in August 2016. v1/JAR signing is
 * the historically accurate default for this catalog's era, not an
 * arbitrary placeholder — a real backend ingesting actual APKs (Phase 5)
 * would need to detect the real scheme(s) per file instead.
 *
 * "use client" for the same reason as ChecksumDisplay: only the copy
 * button needs it, but `navigator.clipboard` isn't available during
 * SSR, so the static parts have to cross the boundary along with it.
 */
export default function SignatureInfo({ fingerprint }: { fingerprint: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fingerprint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Same fallback reasoning as ChecksumDisplay: the fingerprint is
      // still selectable text right above the button either way.
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.field}>
        <span className={styles.label}>Signing certificate fingerprint (SHA-256)</span>
        <div className={styles.row}>
          <code className={styles.fingerprint}>{fingerprint}</code>
          <button type="button" className={styles.copyButton} onClick={handleCopy}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Signature scheme</span>
        <span className={styles.scheme}>APK Signature Scheme v1 (JAR signing)</span>
      </div>

      <span className={styles.srOnly} role="status" aria-live="polite">
        {copied ? "Fingerprint copied to clipboard" : ""}
      </span>
    </div>
  );
}
