import { createElement } from "react";
import { categoryIconShapes } from "@/lib/category-icons";

/**
 * Draws a category's icon from its Material Symbols name as an inline SVG.
 * Decorative: the category's name is always printed next to it, so the icon is
 * hidden from assistive technology. Colour comes from the parent (`currentColor`).
 */
export default function CategoryIcon({ icon, className }: { icon: string; className?: string }) {
  const shapes = categoryIconShapes(icon);
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}
