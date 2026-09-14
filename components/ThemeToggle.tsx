"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setThemeCookie } from "@/lib/theme-actions";
import type { Theme } from "@/lib/theme";
import styles from "./ThemeToggle.module.css";

/**
 * Theme toggle — leaf 0.c.i.zo.
 *
 * The only client component in the header: everything else (nav
 * collapse, search) needed no JS, but flipping the theme has to call
 * the setThemeCookie server action (lib/theme.ts, 0.b.iii.zi) and then
 * refresh so the server-rendered <html data-theme> picks up the new
 * cookie value — that round-trip can't happen from a server component.
 *
 * `theme` comes down from app/layout.tsx (which already reads the
 * cookie via getTheme() to set data-theme on <html>), so there's a
 * single source of truth for "current theme" rather than this
 * component tracking its own local state that could drift from it.
 *
 * The fade between themes itself is 0.b.iii.zo's CSS transition on
 * <body> — this component only triggers the swap, it doesn't animate
 * anything itself.
 */
export default function ThemeToggle({ theme }: { theme: Theme }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const next: Theme = theme === "dark" ? "light" : "dark";

  function handleClick() {
    startTransition(async () => {
      await setThemeCookie(next);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={styles.toggle}
    >
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
