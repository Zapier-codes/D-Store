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
    accent: "#5b7fbd",
    accentStrong: "#3f5f95",
    border: "#d3e0f0",
    gradient: "radial-gradient(ellipse 100% 60% at 50% -10%, rgba(91, 127, 189, 0.08), transparent 60%)",
  },
};

export const CATEGORY_THEMES: CategoryThemeRegistry = {
  finance: VAULT_THEME,
  reading: SANCTUARY_THEME,
};
