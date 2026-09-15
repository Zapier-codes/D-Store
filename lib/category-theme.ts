import type { Category } from "./mock-data";

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
 * Out of scope for this leaf:
 *   - the actual "Vault"/"Sanctuary" registers and the dummy
 *     Finance/scripture catalog entries they attach to (0.i.i.zo)
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

export const CATEGORY_THEMES: CategoryThemeRegistry = {};
