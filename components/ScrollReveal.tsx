"use client";

import type { ReactNode } from "react";
import { useScrollReveal } from "@/lib/useScrollReveal";
import styles from "./ScrollReveal.module.css";

/**
 * Scroll-reveal wrapper — leaf 3.a.i.zi, built on `useScrollReveal`
 * (`lib/useScrollReveal.ts`). Wraps arbitrary children in a `<div>`
 * that fades/slides in the first time it scrolls into view.
 *
 * This is the reusable utility itself, not applied to any page yet —
 * that's `3.a.i.zo` (shelves/hero), which will wrap `Shelf`/`Hero`
 * sections in this component.
 *
 * `className` is passed through (not just spread onto the wrapper
 * blindly) so a consumer can add its own layout classes alongside the
 * reveal animation classes, without those two concerns fighting over
 * the same `className` prop.
 */
export default function ScrollReveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { ref, isRevealed } = useScrollReveal<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={[styles.reveal, isRevealed ? styles.revealed : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
