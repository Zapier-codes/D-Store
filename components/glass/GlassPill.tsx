import type { ReactNode } from "react";
import glass from "./glass.module.css";

/**
 * A transparent glass pill, the look every button-like item shares on the home hero card and the details page
 * (operator-directed 2026-10-08, slice 0 of the details page rework). Server component, no logic: it only picks
 * the shared classes. `className` is for the caller's own layout rules (hide on small screens, margins).
 *
 * Variants: `default` (neutral), `accent` (small uppercase label such as Featured), `star` (rating, accent text),
 * `cta` (the big primary-action look; the caller owns what it does, a pill that is not a link or a button is
 * only a cue and should be `aria-hidden`).
 */
export type GlassPillVariant = "default" | "accent" | "star" | "cta";

const VARIANT_CLASS: Record<GlassPillVariant, string> = {
  default: "",
  accent: glass.pillAccent,
  star: glass.pillStar,
  cta: glass.pillCta,
};

export default function GlassPill({
  variant = "default",
  className,
  children,
  ...rest
}: {
  variant?: GlassPillVariant;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "className" | "children">) {
  const classes = [glass.pill, VARIANT_CLASS[variant], className].filter(Boolean).join(" ");
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}

/** A quieter run of text inside a pill, for example the rating count after the average. */
export function PillMuted({ children }: { children: ReactNode }) {
  return <span className={glass.muted}>{children}</span>;
}

/** The wrapping row pills sit in. */
export function PillRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[glass.pillRow, className].filter(Boolean).join(" ")}>{children}</div>;
}
