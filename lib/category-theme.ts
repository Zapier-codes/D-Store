import type { AppType } from "./taxonomy";
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
 * keyed to the two-axis category it re-skins — `(appType, category)`, the
 * Play-vocabulary pair from `lib/taxonomy.ts` (leaf `5.i.v.zi`; it was a
 * single legacy `Category.slug` before). Both halves are needed: `sports`
 * is an app category and a game genre, and a register for one must not
 * skin the other.
 */
export interface CategoryTheme {
  appType: AppType;
  category: string;
  /** Human-readable register name, e.g. "Vault", "Sanctuary" — surfaced nowhere in the UI yet, but keeps registers self-describing in code/reviews. */
  name: string;
  dark: CategoryThemeTokens;
  light: CategoryThemeTokens;
}

/**
 * Registry a resolver looks up by `themeKey(appType, category)`.
 * Deliberately sparse — most categories have no register and must fall
 * back to the plain `0.b` base tokens (0.i.iii.zi), not every vocabulary
 * entry is expected to have one here.
 *
 * Keyed by the composite string from `themeKey`, not by a bare slug
 * (leaf `5.i.v.zi`): a bare slug is ambiguous across the two axes
 * (`sports`), so the key carries the axis. Populated by 0.i.i.zo (Vault,
 * Sanctuary).
 */
export type CategoryThemeRegistry = Readonly<Record<string, CategoryTheme>>;

/**
 * The registry key for a two-axis category — `"app:finance"`,
 * `"game:sports"`. Collision-free by construction: the axis prefix keeps
 * the app category `sports` and the game genre `sports` apart, and a
 * taxonomy slug is `[a-z0-9-]` only (`taxonomySlug`), so it can never
 * contain the `:` separator and two different pairs can never produce the
 * same key. The prefix also means no slug can spell an inherited object
 * property (`"app:constructor"` is not `"constructor"`).
 */
export function themeKey(appType: AppType, category: string): string {
  return `${appType}:${category}`;
}

/**
 * "Vault" — leaf 0.i.i.zo, first reference register. Attaches to the
 * `finance` category (Play's "Finance", `app` axis — the slug is the same
 * on the legacy and the two-axis model), whose one app so far,
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
  appType: "app",
  category: "finance",
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
 * `books-and-reference` on the `app` axis (leaf `5.i.v.zi`; the legacy
 * `reading` slug maps here through `toPlay`), whose scripture app,
 * "Quiet Verse", supplied this register's accent colors
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
  appType: "app",
  category: "books-and-reference",
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
  [themeKey(VAULT_THEME.appType, VAULT_THEME.category)]: VAULT_THEME,
  [themeKey(SANCTUARY_THEME.appType, SANCTUARY_THEME.category)]: SANCTUARY_THEME,
};

/**
 * Resolver — leaf 0.i.ii.zi, re-keyed to the two-axis model by
 * `5.i.v.zi`. Given a category as `(appType, category)` — the Play
 * vocabulary pair, so callers pass what `toPlay` returns for an app or
 * what the `/categories/[appType]/[slug]` route already has — and the
 * current dark/light mode (`lib/theme.ts`'s `Theme`, already read
 * server-side by every page via `getTheme()`), returns the matching
 * register's token set for that mode, or `undefined` if the category has
 * no register — most won't, and `undefined` is the correct, unremarkable
 * result of that, not an error case. Never throws: a missing `appType` or
 * `category`, or a value that is not a string, is simply "no register".
 *
 * The dedicated "no register" *fallback* behavior (rendering the
 * plain `0.b` base tokens instead) is `0.i.iii.zi`/`zo`'s audit: what
 * this function does for `undefined` is already the fallback in
 * substance (nothing to apply, so `CategoryThemeScope` renders its
 * children with no wrapping element and they keep the `0.b` base tokens
 * `app/globals.css`'s `[data-theme]` block applied at the document root).
 *
 * Leaf `5.i.v.zi` re-audit (a scratch check, not committed; results are
 * in that leaf's Done note): every entry of the
 * Play vocabulary (both axes, plus `uncategorized`) was resolved in both
 * modes; exactly `app:finance` and `app:books-and-reference` return a
 * register, the game-axis `sports` does not pick up an app-axis register,
 * and every other entry resolves to `undefined`.
 */
export function resolveCategoryTheme(
  appType: AppType | undefined,
  category: string | undefined,
  mode: Theme
): CategoryThemeTokens | undefined {
  if (typeof appType !== "string" || typeof category !== "string" || !appType || !category) {
    return undefined;
  }
  const key = themeKey(appType, category);
  if (!Object.prototype.hasOwnProperty.call(CATEGORY_THEMES, key)) {
    return undefined;
  }
  return CATEGORY_THEMES[key][mode];
}
