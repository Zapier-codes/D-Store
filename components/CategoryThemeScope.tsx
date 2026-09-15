import type { CSSProperties } from "react";
import type { Category } from "@/lib/mock-data";
import type { Theme } from "@/lib/theme";
import { resolveCategoryTheme, type CategoryThemeTokens } from "@/lib/category-theme";

/**
 * Category-theme scope — leaf 0.i.ii.zi, the "emit it as scoped CSS
 * custom properties" half of the resolver. Wiring this into the
 * actual detail/browse pages is a separate leaf (0.i.ii.zo) — nothing
 * imports this component into a real page yet, same build-the-
 * primitive-before-the-consumer pattern this repo has followed
 * throughout (e.g. ShelfGrid, 0.c.ii.zi, before any card populated it).
 *
 * Server-rendered, no client JS: the inline `style` block is computed
 * during render from `resolveCategoryTheme()`, the same no-flash
 * convention `0.b.iii.zi`'s cookie-read-before-paint uses — there's no
 * client-side swap after hydration here either.
 *
 * Overrides the same `--color-bg`/`--color-surface`/`--color-accent`/
 * `--color-accent-strong`/`--color-border`/`--gradient-vignette`
 * custom properties `app/globals.css`'s `[data-theme]` blocks already
 * define, scoped to this wrapper's subtree via a plain inline style on
 * a `<div>` — CSS custom properties cascade to descendants the normal
 * way, so nothing inside needs to know it's inside a category skin
 * versus the plain base theme; it just reads the same variable names
 * either way.
 *
 * When the category has no register, `resolveCategoryTheme` returns
 * `undefined` and this renders children with no wrapping element at
 * all (not an empty-styled `<div>`) — there's nothing to scope, so
 * there's no reason to add a DOM node for it.
 */
export default function CategoryThemeScope({
  categorySlug,
  mode,
  children,
}: {
  categorySlug: Category["slug"] | undefined;
  mode: Theme;
  children: React.ReactNode;
}) {
  const tokens = resolveCategoryTheme(categorySlug, mode);

  if (!tokens) {
    return <>{children}</>;
  }

  return <div style={tokensToStyle(tokens)}>{children}</div>;
}

function tokensToStyle(tokens: CategoryThemeTokens): CSSProperties {
  const style: Record<string, string> = {
    "--color-bg": tokens.bg,
    "--color-surface": tokens.surface,
    "--color-accent": tokens.accent,
    "--color-accent-strong": tokens.accentStrong,
    "--color-border": tokens.border,
  };
  if (tokens.gradient) {
    style["--gradient-vignette"] = tokens.gradient;
  }
  // CSS custom properties aren't in React's CSSProperties type — this
  // cast is the standard, narrow way to pass them through inline style.
  return style as CSSProperties;
}
