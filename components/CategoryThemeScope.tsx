import type { AppType } from "@/lib/taxonomy";
import { resolveCategoryTheme, type CategoryThemeTokens } from "@/lib/category-theme";
import styles from "./CategoryThemeScope.module.css";

/**
 * Category-theme scope — leaf 0.i.ii.zi (resolver + scoped emission),
 * wired into real pages by 0.i.ii.zo, re-keyed to the two-axis model by
 * `5.i.v.zi`, and changed on 2026-10-08 so it no longer needs to know the
 * visitor's theme. It takes a category as `appType` + `category` (the Play
 * vocabulary pair): `app/app/[slug]/page.tsx` (App Detail, 0.e) wraps its
 * `<main>` with this, passing the pair `toPlay` gives for the app;
 * `app/categories/[appType]/[slug]/page.tsx` (category browse) passes its
 * own route params.
 *
 * The theme now follows the device (`lib/theme.ts`), set on `<html>` by a
 * script in the browser, so the server cannot pick the dark or light token
 * set. Instead this emits BOTH, as two scoped rules keyed on the same
 * `[data-theme]` attribute `app/globals.css` uses, and the browser applies
 * whichever matches the device. Still server-rendered, no client JS.
 *
 * Overrides the same `--color-bg`/`--color-surface`/`--color-accent`/
 * `--color-accent-strong`/`--color-border`/`--gradient-vignette` custom
 * properties the `[data-theme]` blocks define, scoped to this wrapper's
 * subtree, so nothing inside needs to know it is inside a category skin.
 * Both consumers wrap only their page's own `<main>`, never the shared
 * header/footer, so the skin never leaks into the chrome.
 *
 * When the category has no register, `resolveCategoryTheme` returns
 * `undefined` for both modes and this renders children with no wrapping
 * element at all.
 */
export default function CategoryThemeScope({
  appType,
  category,
  children,
}: {
  appType: AppType | undefined;
  category: string | undefined;
  children: React.ReactNode;
}) {
  const dark = resolveCategoryTheme(appType, category, "dark");
  const light = resolveCategoryTheme(appType, category, "light");

  if (!dark && !light) {
    return <>{children}</>;
  }

  // The class is built from the registry's own slugs; strip anything else so it stays a safe CSS identifier.
  const scopeClass = `ct-${String(appType)}-${String(category)}`.replace(/[^a-zA-Z0-9_-]/g, "");
  const css = [
    dark && `[data-theme="dark"] .${scopeClass}{${tokensToCss(dark)}}`,
    light && `[data-theme="light"] .${scopeClass}{${tokensToCss(light)}}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className={`${styles.scope} ${scopeClass}`}>{children}</div>
    </>
  );
}

function tokensToCss(tokens: CategoryThemeTokens): string {
  const declarations = [
    `--color-bg:${tokens.bg}`,
    `--color-surface:${tokens.surface}`,
    `--color-accent:${tokens.accent}`,
    `--color-accent-strong:${tokens.accentStrong}`,
    `--color-border:${tokens.border}`,
  ];
  if (tokens.gradient) declarations.push(`--gradient-vignette:${tokens.gradient}`);
  return declarations.join(";");
}
