"use client";

import { useRef, type ReactNode } from "react";
import glass from "./glass.module.css";

/**
 * Pointer-driven 3D tilt and depth parallax, shared by the home hero card and the details page header
 * (operator-directed 2026-10-08; generalised from the hero's `HeroTilt`, same behaviour).
 *
 * It only sets CSS custom properties (`--rx`, `--ry`, `--px`, `--py`, `--mx`, `--my`) on its wrapper; the
 * stylesheet of whoever uses it turns them into a small rotation, layer drift and the rim light's position
 * (glass.module.css). Touch input and visitors who prefer reduced motion get nothing, so a swipe never
 * fights a tilt. The wrapper carries `perspective` and the resting values of every variable.
 */
const MAX_TILT_DEG = 5;

export default function Tilt({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const px = (event.clientX - rect.left) / rect.width; // 0..1
    const py = (event.clientY - rect.top) / rect.height;
    node.style.setProperty("--ry", `${((px - 0.5) * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
    node.style.setProperty("--rx", `${((0.5 - py) * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
    // Unitless -1..1 offsets the stylesheet multiplies into small parallax shifts (icon, name, backdrop).
    node.style.setProperty("--px", ((px - 0.5) * 2).toFixed(3));
    node.style.setProperty("--py", ((py - 0.5) * 2).toFixed(3));
    node.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
    node.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
  };

  const onLeave = () => {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty("--rx", "0deg");
    node.style.setProperty("--ry", "0deg");
    node.style.setProperty("--px", "0");
    node.style.setProperty("--py", "0");
  };

  return (
    <div
      ref={ref}
      className={[glass.tilt, className].filter(Boolean).join(" ")}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      {children}
    </div>
  );
}
