"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import styles from "./ShareButton.module.css";

/**
 * Share button + QR code — leaf `4.c.ii.zi`, first leaf of `4.c.ii`
 * (Sharing). Sits in the app detail page's `installRow`, next to
 * Install/Download (`app/app/[slug]/page.tsx`), so sharing an app is
 * as immediate an action as installing it.
 *
 * Two paths, chosen at click time, same "native platform behavior
 * over reimplementing it" preference `Lightbox.tsx` (0.e.i.zo) already
 * states: where the Web Share API (`navigator.share`) is available —
 * effectively all mobile browsers, where "share this app" actually
 * matters most — this opens the OS's own native share sheet directly,
 * no UI of this component's own involved at all. Everywhere else
 * (most desktop browsers as of writing), it falls back to a small
 * `<dialog>` modal — same native-dialog convention `Lightbox.tsx`
 * already established (`showModal()` for focus trap + top-layer, the
 * browser's own Escape-to-close, a click-on-backdrop handler) — with
 * a "Copy link" button and a scannable QR code for "get this app on
 * your phone from your desktop," which `navigator.share` alone
 * wouldn't cover on desktop anyway.
 *
 * The URL shared/encoded is always `window.location.href` — the
 * actual current page the visitor is on — not a reconstructed one
 * from an env-var base URL (`app/sitemap.ts`/`app/feed.xml/route.ts`'s
 * `BASE_URL` pattern): this runs client-side only, so the real
 * address bar URL is both simpler to get right and correct in every
 * environment (local dev, a Vercel preview deployment, production)
 * without needing its own env var.
 *
 * QR generation is local/offline: the `qrcode` package (pure JS, no
 * network call, MIT-licensed) renders directly to this component's own
 * `<canvas>` via `QRCode.toCanvas` — no third-party QR-image API
 * (e.g. `api.qrserver.com`) that this repo's install would otherwise
 * have to unnecessarily depend on at render time for a small string
 * encode.
 */
export default function ShareButton({ appName }: { appName: string }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nativeShareSupported, setNativeShareSupported] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Read at mount, not render — `navigator` doesn't exist during SSR,
  // and this only needs to be known once (whether the Web Share API
  // exists doesn't change over a page's lifetime).
  useEffect(() => {
    setNativeShareSupported(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (modalOpen && dialog && !dialog.open) {
      dialog.showModal();
    }
  }, [modalOpen]);

  // Draws once the dialog (and its canvas) actually exists in the DOM
  // — this effect intentionally depends on `modalOpen`, not just
  // mount, since the canvas element itself doesn't exist until the
  // fallback modal renders.
  useEffect(() => {
    if (!modalOpen || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, window.location.href, {
      width: 176,
      margin: 1,
    }).catch(() => {
      // A failed draw leaves an empty canvas — "Copy link" right below
      // it is still a fully working fallback, so nothing else to do.
    });
  }, [modalOpen]);

  async function handleShareClick() {
    if (nativeShareSupported) {
      try {
        await navigator.share({ title: appName, url: window.location.href });
      } catch {
        // AbortError (user dismissed the native sheet) or any other
        // failure — either way, nothing this component should surface
        // as an error; the visitor simply didn't complete a share.
      }
      return;
    }
    setModalOpen(true);
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Same posture as ChecksumDisplay.tsx's copy button — the link
      // is still selectable text in the input right above, so there's
      // a manual fallback either way.
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.shareButton}
        onClick={handleShareClick}
        aria-label={`Share ${appName}`}
      >
        Share
      </button>

      {modalOpen && (
        <dialog
          ref={dialogRef}
          className={styles.dialog}
          onClose={() => setModalOpen(false)}
          onClick={(event) => {
            if (event.target === dialogRef.current) dialogRef.current?.close();
          }}
          aria-label={`Share ${appName}`}
        >
          <div className={styles.content}>
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => dialogRef.current?.close()}
              aria-label="Close share dialog"
            >
              ✕
            </button>
            <h2 className={styles.title}>Share {appName}</h2>
            <canvas ref={canvasRef} className={styles.qrCanvas} aria-hidden="true" />
            <p className={styles.hint}>Scan to open this app&rsquo;s page on your phone</p>
            <div className={styles.copyRow}>
              <input
                type="text"
                readOnly
                value={typeof window !== "undefined" ? window.location.href : ""}
                className={styles.linkInput}
                onFocus={(event) => event.currentTarget.select()}
                aria-label={`Link to ${appName}`}
              />
              <button type="button" className={styles.copyButton} onClick={handleCopyLink}>
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
            <span className={styles.srOnly} role="status" aria-live="polite">
              {copied ? "Link copied to clipboard" : ""}
            </span>
          </div>
        </dialog>
      )}
    </>
  );
}
