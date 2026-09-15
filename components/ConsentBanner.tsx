"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { acknowledgeConsent } from "@/lib/consent-actions";
import styles from "./ConsentBanner.module.css";

/**
 * Cookie consent banner — leaf 2.d.ii.zi (Legal & Compliance,
 * Consent).
 *
 * Same client-component shape as ThemeToggle (0.c.i.zo): the only bit
 * of interactivity is calling the acknowledgeConsent server action
 * (lib/consent-actions.ts) and refreshing so the server-rendered
 * `hasGivenConsent()` check in app/layout.tsx picks up the new cookie
 * and stops rendering this banner — same round-trip reasoning as the
 * theme toggle, and the same single-source-of-truth motivation for not
 * tracking "dismissed" as separate client-side state.
 *
 * Copy is scoped to what's actually true today (see lib/consent.ts's
 * doc comment): D-Store has no ad infrastructure yet, so this
 * discloses the two real functional cookies (theme, region) rather
 * than a generic "we use cookies for a better experience" line, and
 * links to the Privacy Policy (2.d.i.zi) for the full detail instead
 * of duplicating it here.
 */
export default function ConsentBanner() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleAcknowledge() {
    startTransition(async () => {
      await acknowledgeConsent();
      router.refresh();
    });
  }

  return (
    <div className={styles.banner} role="region" aria-label="Cookie notice">
      <p className={styles.text}>
        D-Store uses two functional cookies — one to remember your theme, one to cache your
        approximate region — neither for tracking or advertising. See our{" "}
        <Link href="/privacy" className={styles.link}>
          Privacy Policy
        </Link>{" "}
        for details.
      </p>
      <button
        type="button"
        onClick={handleAcknowledge}
        disabled={isPending}
        className={styles.button}
      >
        Got it
      </button>
    </div>
  );
}
