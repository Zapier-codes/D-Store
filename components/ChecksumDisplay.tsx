"use client";

import { useState } from "react";
import styles from "./ChecksumDisplay.module.css";

/**
 * SHA256 checksum display — leaf 0.f.i.zi (App Detail Page → APK
 * verification), first leaf of the "Verify this APK" section. Extended
 * by 0.f.i.zo (digital signature info) in the same section later.
 *
 * Per docs/D-STORE.md §2: "D-Store's edge over Play Store, given the
 * context: it can be more transparent about the app itself —
 * checksums, permissions, and source links up front — since that's
 * exactly the trust Play Store's walled review process normally
 * provides and sideloading skips." This is the first piece of that:
 * `App.sha256_checksum` (lib/mock-data.ts) rendered as a monospace,
 * copyable hash — a dummy value in Phase 0 (generated once via
 * `secrets.token_hex(32)` when the mock dataset was seeded, not a real
 * digest of any actual APK bytes, since no real APK files exist in
 * this repo yet), but real once a backend computes actual checksums
 * from uploaded/mirrored APKs (Phase 5).
 *
 * "use client" only for the copy-to-clipboard button — the checksum
 * text itself needs no interactivity and would be a server component
 * on its own; `navigator.clipboard` isn't available during SSR, so the
 * whole thing has to cross the boundary together rather than trying to
 * split the button out separately for one string prop.
 */
export default function ChecksumDisplay({ checksum }: { checksum: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(checksum);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, insecure context, etc.) —
      // the hash is still selectable text right above the button, so
      // there's a manual fallback either way; nothing further to do.
    }
  }

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>SHA-256 checksum</span>
      <div className={styles.row}>
        <code className={styles.hash}>{checksum}</code>
        <button type="button" className={styles.copyButton} onClick={handleCopy}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {copied ? "Checksum copied to clipboard" : ""}
      </span>
    </div>
  );
}
