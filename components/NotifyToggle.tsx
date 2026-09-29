"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { listFavorites, onFavoritesChange } from "@/lib/favorites";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push-client";
import { MAX_SLUGS } from "@/lib/push-validate";
import {
  browserPushSupportEnv,
  getPushSupport,
  getVapidPublicKey,
  selectSlugs,
  type SelectedSlugs,
} from "@/lib/push-support";
import styles from "./NotifyToggle.module.css";

/**
 * "Notify me about updates" control for `/saved`  leaf `5.k.ix.zo`, last of
 * the two `5.k.ix` leaves (split out of `5.k.ii.zi`). The only place a visitor
 * opts in to Web Push; `PushSync` (`5.k.ix.zi`) keeps the subscription's app
 * list current afterwards.
 *
 * **Renders nothing** unless push is configured and this browser can use it:
 * no `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (or a malformed one) means no button, no
 * disabled button and no hint, so nothing is offered or collected until the
 * operator configures the key. Nothing is read from IndexedDB either in that
 * case. It also renders nothing on the server and on the first client render
 * (visibility is decided in an effect), so server and client HTML always agree.
 *
 * **Permission is asked only inside the click handler, never on load.**
 * `enablePush` must be the first thing the handler calls, with nothing
 * awaited before it (Safari treats an earlier `await` as a lost user
 * gesture). It needs the slug list, and favorites live in IndexedDB behind an
 * async read, so the list is read ahead of time (on mount and on every
 * favorites change) into a ref and the handler uses that copy synchronously.
 * Until the first read finishes the control is not shown, so there is no
 * click that could beat the data.
 *
 * **Recorded decisions:**
 *  - A closed permission prompt (`dismissed`) keeps the button and says so;
 *    the permission is still `default`, so trying again is allowed.
 *  - `not_available` and `failed` keep the button too (both can be transient);
 *    `denied` removes it, because a page cannot re-prompt.
 *  - After every action the true state is re-read with `getPushState()`
 *    rather than assumed, so the label never disagrees with the browser.
 *  - Turning off when only the server call failed still counts as off  the
 *    device stopped, and the server's copy is removed once it stops working
 *    (`disablePush`'s own contract)  and the line says exactly that.
 *  - Slugs beyond the server's cap (`truncated`) and unusable slugs
 *    (`skipped`) are shown, not hidden; `PushSync` deliberately ignores both.
 *  - The `denied` text lives in the `aria-live` region and takes focus when a
 *    click causes it, because the button that had focus is removed.
 *
 * `public/sw.js` has its `push`, `notificationclick` and `pushsubscriptionchange`
 * handlers (`5.k.ii.zo`), so a subscription made here can show a notification
 * once something sends one. Nothing does yet: the sender (`5.k.iii.zi`/`zo`)
 * and its trigger (Held `5.k.iv.zi`) are still open, so turning this on today
 * subscribes the device but no update notification will arrive.
 */

type View = "hidden" | "needs_home_screen" | PushState;

interface Notice {
  tone: "info" | "error";
  text: string;
}

const BLOCKED_TEXT =
  "Notifications are blocked for D-Store in your browser settings. Allow them there, then come back and turn this on.";

function savedAppsPhrase(count: number): string {
  return count === 1 ? "1 saved app" : `${count} saved apps`;
}

export default function NotifyToggle() {
  const [view, setView] = useState<View>("hidden");
  const [selection, setSelection] = useState<SelectedSlugs | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const selectionRef = useRef<SelectedSlugs>({ slugs: [], truncated: false, skipped: 0 });
  const busyRef = useRef(false);
  const aliveRef = useRef(true);
  const focusStatusRef = useRef(false);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    aliveRef.current = true;
    // Configured, and this browser can do it  otherwise leave the control unrendered and read nothing.
    if (getVapidPublicKey() === null) return;
    const support = getPushSupport(browserPushSupportEnv());
    if (support === "unsupported") return;
    if (support === "needs_home_screen") {
      setView("needs_home_screen");
      return;
    }

    let readId = 0;
    async function readFavorites() {
      const id = ++readId;
      const next = selectSlugs(await listFavorites());
      if (!aliveRef.current || id !== readId) return; // unmounted, or a newer read is in flight
      selectionRef.current = next;
      setSelection(next);
    }
    void readFavorites();
    const stopListening = onFavoritesChange(() => void readFavorites());
    void getPushState().then((state) => {
      if (aliveRef.current) setView(state);
    });

    return () => {
      aliveRef.current = false;
      stopListening();
    };
  }, []);

  // The button that had focus is gone once permission is `denied`; move focus to the message instead.
  useEffect(() => {
    if (view === "denied" && focusStatusRef.current) {
      focusStatusRef.current = false;
      statusRef.current?.focus();
    }
  }, [view]);

  function handleEnable() {
    if (busyRef.current) return;
    busyRef.current = true;
    // Called synchronously, before anything else: the permission prompt must be the first thing awaited.
    const pending = enablePush(selectionRef.current.slugs);
    const sent = selectionRef.current.slugs.length;
    setBusy(true);
    setNotice(null);

    void pending.then(async (result) => {
      let next: View | null = null;
      let message: Notice | null = null;

      if (result === "subscribed") {
        next = "on";
        message = {
          tone: "info",
          text:
            sent === 0
              ? "Update notifications are on. Save an app and you'll hear when it has an update."
              : `Update notifications are on for ${savedAppsPhrase(sent)}.`,
        };
      } else if (result === "denied") {
        next = "denied";
        focusStatusRef.current = true;
      } else {
        // Anything else: report what happened, then let the browser say what the state really is.
        if (result === "dismissed") {
          message = { tone: "info", text: "Notifications weren't turned on. You can try again any time." };
        } else if (result === "not_available") {
          message = { tone: "info", text: "Not available right now. Please try again later." };
        } else {
          message = { tone: "error", text: "Couldn't turn on update notifications. Check your connection and try again." };
        }
        next = await getPushState();
      }

      busyRef.current = false;
      if (!aliveRef.current) return;
      setNotice(message);
      if (next) setView(next);
      setBusy(false);
    });
  }

  async function handleDisable() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);

    const result = await disablePush();
    const state = await getPushState();

    let message: Notice;
    if (state === "on") {
      message = { tone: "error", text: "Couldn't turn off update notifications. Please try again." };
    } else if (!result.ok && result.server === "failed") {
      message = {
        tone: "info",
        text: "Update notifications are off on this device. We couldn't reach our server to delete your push address just now; it will be deleted automatically once it stops working.",
      };
    } else {
      message = { tone: "info", text: "Update notifications are off." };
    }

    busyRef.current = false;
    if (!aliveRef.current) return;
    setNotice(message);
    setView(state);
    setBusy(false);
  }

  if (view === "hidden") return null;
  if (view !== "needs_home_screen" && selection === null) return null; // favorites not read yet

  const canOffer = view === "off" || view === "on";
  const statusText = notice ? notice.text : view === "denied" ? BLOCKED_TEXT : null;

  return (
    <section className={styles.toggle} aria-label="Update notifications">
      {view === "needs_home_screen" ? (
        <p className={styles.description}>
          Add D-Store to your Home Screen first, then open it from there to turn on update notifications.
        </p>
      ) : null}

      {canOffer ? (
        <p className={styles.description}>
          Get a notification when an app you&rsquo;ve saved has an update. No account needed.
        </p>
      ) : null}

      {canOffer ? (
        <button
          type="button"
          className={styles.button}
          onClick={view === "off" ? handleEnable : handleDisable}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "Working\u2026" : view === "off" ? "Notify me about updates" : "Turn off update notifications"}
        </button>
      ) : null}

      {canOffer && selection?.truncated ? (
        <p className={styles.note}>
          You&rsquo;ve saved more than {MAX_SLUGS} apps. Notifications cover the {MAX_SLUGS} you saved most recently.
        </p>
      ) : null}

      {canOffer && selection && selection.skipped > 0 ? (
        <p className={styles.note}>
          {selection.skipped === 1
            ? "1 saved app can't be included in notifications."
            : `${selection.skipped} saved apps can't be included in notifications.`}
        </p>
      ) : null}

      {/* Always present once the control shows, so a screen reader is already watching it when text arrives. */}
      <p
        ref={statusRef}
        className={notice?.tone === "error" ? `${styles.status} ${styles.error}` : styles.status}
        aria-live="polite"
        aria-atomic="true"
        tabIndex={-1}
      >
        {statusText}
      </p>

      <Link href="/privacy" className={styles.link}>
        What&rsquo;s stored for notifications
      </Link>
    </section>
  );
}
