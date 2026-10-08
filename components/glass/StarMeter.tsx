import { ratingFillPercent } from "@/lib/hero-card";
import glass from "./glass.module.css";

/**
 * A five-star meter filled exactly as far as the rating (4.6 fills 92%), drawn as clipped text so it needs no
 * images. Decorative: the number next to it (or the caller's `aria-label`) carries the meaning, so it is
 * `aria-hidden`. Empty stars use `--color-star-empty`, which clears the 3:1 bar for graphics in both themes.
 * Operator-directed 2026-10-08 (moved here from Hero.module.css, unchanged).
 */
export default function StarMeter({ average, className }: { average: number | null | undefined; className?: string }) {
  const fill = ratingFillPercent(average);
  return (
    <span
      className={[glass.stars, className].filter(Boolean).join(" ")}
      style={{ "--fill": `${fill}%` } as React.CSSProperties}
      aria-hidden="true"
    >
      ★★★★★
    </span>
  );
}
