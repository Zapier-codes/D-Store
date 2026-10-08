import type { ReactNode } from "react";
import glass from "./glass.module.css";

/**
 * The app name as a heading, with the hero's two treatments (operator-directed 2026-10-08): dark is solid text
 * with a stacked accent extrusion and a short accent bar; light is clear frosted glass with no colour at all.
 * The treatment is pure CSS (`[data-theme]` is set before first paint), so this stays a server component.
 *
 * `as` picks the heading level (one `<h1>` per page: the details page and the first hero card use `h1`).
 * Size comes from `--glass-name-size` on the element or any ancestor, defaulting to the hero's size.
 */
export default function AppNameTitle({
  as: Heading = "h2",
  className,
  children,
}: {
  as?: "h1" | "h2" | "h3";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={[glass.nameWrap, className].filter(Boolean).join(" ")}>
      <Heading className={glass.name}>{children}</Heading>
    </span>
  );
}
