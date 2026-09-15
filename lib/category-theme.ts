import type { Category } from "./mock-data";
import type { Theme } from "./theme";

/**
 * CategoryTheme token schema — leaf 0.i.i.zi (Priority override,
 * "Contextual Skins" — see HANDOVER.md's `0.i` note).
 *
 * Mirrors `0.b`'s token shape (`app/globals.css`: `--color-bg`,
 * `--color-surface`, `--color-accent`, `--color-accent-strong`,
 * `--color-border`, `--gradient-vignette`) field-for-field, so
 * `0.i.ii.zi`'s resolver can emit a `CategoryTheme` variant as the same
 * CSS custom properties the base theme already uses — a category skin
 * overrides the same variable names in a scoped block, it doesn't
 * introduce a parallel set a component would need to know about.
 *
 * The one shape difference from `0.b`: `gradient` is optional here.
 * `0.b`'s dark theme has a vignette and its light theme deliberately
 * doesn't ("clinical precision calls for a flat, crisp base, not an
 * oversight" — globals.css); a category register may equally choose a
 * flat variant, so this schema can't require a gradient a "clinical"
 * register would only have to fake.
 *
 * `dark` and `light` are independent `CategoryThemeTokens`, not one set
 * of hues plus a computed brightness flip — this is the specific
 * requirement from the priority-override note: a category's dark-mode
 * and light-mode moods are allowed to lean on genuinely different
 * colors (e.g. "Vault" dark leans on near-black + gold, "Vault" light
 * leans on paper-white + emerald/navy ink — not a lightened copy of the
 * same gold), so nothing in this schema derives one variant from the
 * other.
 *
 * Out of scope for this leaf (registers now added by 0.i.i.zo, below):
 *   - resolving a `CategoryTheme` for the active app/category and
 *     emitting it as scoped CSS custom properties (0.i.ii.zi)
 *   - wiring the resolver into the detail/browse pages (0.i.ii.zo)
 *   - the "no register defined" fallback and its contrast audit
 *     (0.i.iii.zi, 0.i.iii.zo)
 */

/** One mode's full token set for a category register — same fields as a `[data-theme]` block in `app/globals.css`. */
export interface CategoryThemeTokens {
  bg: string;
  surface: string;
  accent: string;
  accentStrong: string;
  border: string;
  /** CSS `background-image` value, e.g. a `radial-gradient(...)` list — omit for a flat register (mirrors 0.b's light theme having none). */
  gradient?: string;
}

/**
 * A full category register: independent dark and light token sets,
 * keyed to the `Category.slug` (`lib/mock-data.ts`) it re-skins.
 */
export interface CategoryTheme {
  categorySlug: Category["slug"];
  /** Human-readable register name, e.g. "Vault", "Sanctuary" — surfaced nowhere in the UI yet, but keeps registers self-describing in code/reviews. */
  name: string;
  dark: CategoryThemeTokens;
  light: CategoryThemeTokens;
}

/**
 * Registry a resolver (0.i.ii.zi) will look up by category slug.
 * Deliberately `Partial` — most categories have no register and must
 * fall back to the plain `0.b` base tokens (0.i.iii.zi), not every
 * `Category.slug` is expected to have an entry here.
 *
 * Populated starting with 0.i.i.zo (Vault, Sanctuary); empty for now —
 * this leaf is the schema only.
 */
export type CategoryThemeRegistry = Partial<Record<Category["slug"], CategoryTheme>>;

/**
 * "Vault" — leaf 0.i.i.zo, first reference register. Attaches to the
 * new `finance` category (`lib/mock-data.ts`), whose one app so far,
 * "Ledger Vault", supplied this register's accent colors so the app's
 * own icon palette and its category skin agree rather than clash.
 *
 * Dark leans on the same near-black + metallic-gold direction `0.b`'s
 * "Cinematic Gold" dark theme already uses, per the priority-override
 * note, but isn't a copy of it: a cooler, slate-leaning near-black
 * (vs. `0.b`'s warm near-black) and a heavier, tighter gold vignette
 * for a denser, more "vault door" feel than the base theme's soft glow.
 * Light deliberately does NOT lighten that gold — paper-white plus deep
 * emerald/navy ink instead, and no gradient at all (flat, crisp,
 * "professional" the same way `0.b`'s light theme is flat for
 * "clinical precision") so the two variants read as different moods,
 * not one hue at two brightness levels.
 *
 * WCAG AA contrast audit (leaf `0.i.iii.zo`, relative-luminance method,
 * same as `0.b.ii.zo`'s original audit): both `accent` and
 * `accentStrong` clear 4.5:1 (normal-text AA) against both `bg` and
 * `surface`, in both modes — dark `accent` #c9a227 is 8.28:1 / 7.76:1,
 * dark `accentStrong` #a17e18 is 5.26:1 / 4.93:1; light `accent`
 * #0f6d4c is 6.01:1 / 6.34:1, light `accentStrong` #0a4f37 is
 * 9.11:1 / 9.60:1. No change needed for this register.
 */
const VAULT_THEME: CategoryTheme = {
  categorySlug: "finance",
  name: "Vault",
  dark: {
    bg: "#07080a",
    surface: "#101214",
    accent: "#c9a227",
    accentStrong: "#a17e18",
    border: "#262a2d",
    gradient:
      "radial-gradient(ellipse 90% 50% at 50% -5%, rgba(201, 162, 39, 0.16), transparent 50%), " +
      "radial-gradient(ellipse 130% 90% at 50% 120%, rgba(0, 0, 0, 0.80), transparent 55%)",
  },
  light: {
    bg: "#faf9f4",
    surface: "#ffffff",
    accent: "#0f6d4c",
    accentStrong: "#0a4f37",
    border: "#d9d4c5",
  },
};

/**
 * "Sanctuary" — leaf 0.i.i.zo, second reference register. Attaches to
 * the existing `reading` category (`lib/mock-data.ts`), whose new
 * scripture app, "Quiet Verse", supplied this register's accent colors
 * for the same reason `finance`/"Vault" does above.
 *
 * Light leans on soft daylight cloud-blues — airy, per the
 * priority-override note, so it gets a gentle gradient (unlike
 * "Vault" light's deliberately flat register) to read as open/airy
 * rather than dense. Dark does NOT darken that same pale blue —
 * deep indigo/navy plus a pale-lavender "starlight" accent instead,
 * so the accent glows against the dark surface rather than the surface
 * itself just being a dimmed version of the light one.
 *
 * WCAG AA contrast audit (leaf `0.i.iii.zo`): dark clears 4.5:1 easily
 * — `accent` #b8c4f0 is 10.74:1 / 9.74:1 (bg/surface), `accentStrong`
 * #9aa8e8 is 8.05:1 / 7.30:1. Light's `accentStrong` #3f5f95 also
 * clears it (5.78:1 / 6.11:1), but light's original `accent` did not:
 * `--color-accent` is used as normal-size `color` (not just large
 * text/UI elements) across this repo's components (`Header`, `Footer`,
 * `Hero`, `AppCard`, `RatingSummary`, etc.), so the AA bar here is
 * 4.5:1, not the 3:1 large-text/UI-only threshold — the original
 * #5b7fbd only reached 3.64:1 / 3.84:1, a real AA failure for that
 * usage. Darkened along the same hue (uniform ~15% RGB scale-down,
 * keeping it visibly lighter/airier than `accentStrong` rather than
 * converging on it) to #4d6ca1, which reaches 4.77:1 / 5.04:1 — this
 * is the one real fix this audit leaf makes; every other accent/
 * accentStrong pairing in both registers already passed.
 */
const SANCTUARY_THEME: CategoryTheme = {
  categorySlug: "reading",
  name: "Sanctuary",
  dark: {
    bg: "#0d1229",
    surface: "#161b3a",
    accent: "#b8c4f0",
    accentStrong: "#9aa8e8",
    border: "#232a4a",
    gradient:
      "radial-gradient(ellipse 120% 60% at 50% -10%, rgba(184, 196, 240, 0.10), transparent 55%), " +
      "radial-gradient(ellipse 140% 100% at 50% 110%, rgba(5, 7, 20, 0.70), transparent 60%)",
  },
  light: {
    bg: "#eef4fb",
    surface: "#f7fafd",
    accent: "#4d6ca1",
    accentStrong: "#3f5f95",
    border: "#d3e0f0",
    gradient: "radial-gradient(ellipse 100% 60% at 50% -10%, rgba(91, 127, 189, 0.08), transparent 60%)",
  },
};

export const CATEGORY_THEMES: CategoryThemeRegistry = {
  finance: VAULT_THEME,
  reading: SANCTUARY_THEME,
};

/**
 * Resolver — leaf 0.i.ii.zi. Given a category slug and the current
 * dark/light mode (`lib/theme.ts`'s `Theme`, already read server-side
 * by every page via `getTheme()`), returns the matching register's
 * token set for that mode, or `undefined` if the category has no
 * register — most categories won't (`CATEGORY_THEMES` is `Partial`),
 * and `undefined` is the correct, unremarkable result of that, not an
 * error case this function needs to handle specially.
 *
 * The dedicated "no register" *fallback* behavior (rendering the
 * plain `0.b` base tokens instead, and re-auditing contrast once every
 * register exists) is `0.i.iii.zi`/`zo` — separate leaves. What this
 * function does for `undefined` is already the fallback in substance
 * (nothing to apply, so the caller naturally inherits whatever tokens
 * are already in scope), `0.i.iii.zi` is about *auditing and
 * documenting* that that's correct across every category, not new
 * behavior this resolver still needs.
 *
 * Leaf `0.i.iii.zi` audit result: every one of the 12 current
 * `categories` (`lib/mock-data.ts`) was checked against
 * `CATEGORY_THEMES` — only `finance` ("Vault") and `reading`
 * ("Sanctuary") have a register; the other 10 (`system`, `multimedia`,
 * `games`, `internet`, `navigation`, `science-education`, `theming`,
 * `time`, `writing`, `development`) correctly resolve to `undefined`
 * in both modes, which `CategoryThemeScope` renders as `children` with
 * no wrapping element — meaning those pages are never left unstyled,
 * they simply keep whatever `0.b` base tokens `app/globals.css`'s
 * `[data-theme]` block already applied at the document root. Verified
 * two ways: (1) a faithful reimplementation of this lookup run for all
 * 12 slugs × both modes confirmed `hasRegister === (resolved tokens
 * truthy)` with zero mismatches; (2) `next build` + `next start`,
 * fetching `/categories/games` (unregistered) and `/categories/finance`
 * (registered) — `games` has zero `--color-bg` occurrences anywhere in
 * the HTML (no scoped override emitted at all) while still carrying
 * `data-theme="dark"` on `<html>` (the base theme, applied via
 * `globals.css`'s attribute selector, not inline style — this is what
 * "never unstyled" actually rests on), and `finance` does emit its
 * Vault dark token (`--color-bg:#07080a`) as expected. No code change
 * was needed for this to hold — this leaf is the audit that confirms
 * it holds for every category today and stays true as new categories
 * are added, since a new unregistered slug takes the exact same path
 * through `resolveCategoryTheme` and `CategoryThemeScope` that every
 * currently-unregistered category already does.
 */
export function resolveCategoryTheme(
  categorySlug: Category["slug"] | undefined,
  mode: Theme
): CategoryThemeTokens | undefined {
  if (!categorySlug) {
    return undefined;
  }
  const theme = CATEGORY_THEMES[categorySlug];
  return theme ? theme[mode] : undefined;
}
