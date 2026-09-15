import type { CSSProperties } from "react";
import type { Category } from "@/lib/mock-data";
import type { Theme } from "@/lib/theme";
import { resolveCategoryTheme, type CategoryThemeTokens } from "@/lib/category-theme";
import styles from "./CategoryThemeScope.module.css";

/**
 * Category-theme scope — leaf 0.i.ii.zi (resolver + scoped emission),
 * wired into real pages by 0.i.ii.zo: `app/app/[slug]/page.tsx` (App
 * Detail, 0.e) wraps its `<main>` with this, `categorySlug={app.category}`;
 * `app/categories/[slug]/page.tsx` (category browse, 0.g.ii) does the
 * same with `categorySlug={slug}` directly, since that page already
 * *is* one category's context.
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
 * either way. Both consumers wrap only their page's own `<main>`, never
 * anything in `app/layout.tsx` (`Header`/`Footer`) — those live
 * structurally outside this component entirely, in the shared layout,
 * so "never leaks into the global header/footer/nav chrome" (this
 * leaf's own requirement) falls out of where this component is placed,
 * not anything it has to actively guard against.
 *
 * `CategoryThemeScope.module.css`'s `.scope` reuses `0.b.iii.zo`'s
 * exact fade convention (same duration/easing/reduced-motion gating)
 * rather than inventing a new transition mechanism, applied here too
 * so a category-themed section's own background/border fades the same
 * way the page background already does on a light/dark toggle.
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

  return (
    <div className={styles.scope} style={tokensToStyle(tokens)}>
      {children}
    </div>
  );
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
