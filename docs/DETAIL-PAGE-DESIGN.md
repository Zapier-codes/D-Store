# App details page: design spec

*Slice 0 of the rework in `docs/DETAIL-PAGE-REWORK-PROMPT.md`, written operator-directed 2026-10-08. Read the brief for the why; this file is the how: what the research said, the chosen layout, the rules every later slice follows, and the order of work. Nothing here was seen in a browser; the sandbox cannot open the live site.*

## 1. Research: what the stores do and what we take

Sources were news and developer-documentation pages found through web search on 2026-10-08; each store's live page was **not** opened. Principles are paraphrased, not copied. **Not researched this session** (the brief lists them as optional): Samsung Galaxy Store, Huawei AppGallery, F-Droid, Microsoft Store, and non-store product pages. Do those in Slice 7 if the operator wants them; nothing in Slices 1 to 6 depends on them.

### Apple App Store (web product page and iOS)

- **What it does.** The top of the page is a large icon beside the name, developer, rating and price/in-app-purchase note. Screenshots come before the description. The description is below them, then What's New with version history, then ratings and reviews, then an information block (size, languages and so on), then "You may also like". Apple moved the age rating and in-app-purchase notice up to the top, under the developer's name, so the facts that decide a download are visible without scrolling. Developers get up to ten screenshots and up to three autoplaying previews; What's New text appears on the product page.
- **Adopt.** Screenshots lead the page. Facts that decide an install sit at the top. An **Information** list (our slice 2) with only the fields we actually have. What's New with a version and a date.
- **Skip.** Autoplaying video (the brief bans autoplay that distracts). The long version-history list (the operator removed Version History).
- **Where D-Store can beat it.** Apple's strip is plain text columns. Ours is glass tiles with a counting-up downloads figure and a fractional star meter, and the page shares one look with the home card.

### Google Play (web and app), Material 3 Expressive

- **What it does.** Play has been taking on Material 3 Expressive in stages: colour on the search tab (June 2025), then in January 2026 a staged rollout of a crinkled, wavy download ring around the app icon and a shape-morphing loading indicator in place of the old circular spinner. Google also told developers that the corner radius of app icons on Play grows from about 20% to 30% from 31 March 2026. The listing itself keeps cards (About, Data safety), a ratings histogram and an install button with progress states.
- **Adopt.** Pill-shaped actions; a live ring around the icon (we already have one on the hero, an arc rather than a crinkle); rounder icons. **Check:** our icon wrapper uses a 22% radius and the ring 25%; Slice 1 should move to about 30% so icons sit like Play's. Keep it in one custom property so the hero and the details page change together.
- **Skip.** Data safety card (removed by the operator). Showing a histogram we cannot back with real votes (see section 6).
- **Where D-Store can beat it.** A desktop two-column page with a sticky glass install card in the same glass and motion language as the home card (not compared against Play's web layout in detail, which was not opened), reduced-transparency and forced-colours fallbacks that neither store ships, and honest numbers only.

### Other stores and product pages

Not researched yet (see the note above).

## 2. Browser support and the fallback for each feature

Reported support in mid-2026 from the search results; confirm on caniuse before relying on anything in Slice 7. Where two sources disagreed (Firefox and scroll-driven animations), the more specific and more recent one is used: it says Firefox 152 (June 2026) still has the feature behind a flag in stable releases.

| Feature | Chrome / Edge | Safari | Firefox | Our fallback |
|---|---|---|---|---|
| `backdrop-filter` | yes | yes | yes | Solid panel (`prefers-reduced-transparency` already does this) |
| `color-mix()` | yes | yes | yes | Already used everywhere in the hero |
| `@property` (ring angle) | yes | 15.4+ | 128+ | The ring shows a still arc (as the hero does today) |
| `mask-composite` (rim, ring) | yes (`exclude`) | yes (`-webkit-mask-composite: xor`) | yes | Both spellings are written; without them the ring is a full circle, the rim a full border: acceptable |
| `animation-timeline: view()` | 115+ | 26+ | **flag only** | `ScrollReveal` (IntersectionObserver) stays the baseline; use `@supports (animation-timeline: view())` only to upgrade |
| View Transitions, same document | 111+ | 18+ | 144+ | None needed: the page just navigates |
| View Transitions, cross document | 126+ | 18+ | not yet | Same; wrap in `@supports`, never required |

## 3. Layout

Design at 360px first, then 768px, then 1100px and above. One `<h1>`: the app name.

**Phone (360 to 767px), one column, top to bottom**

1. **Header glass card** (full width, 12px side margin like the hero). First screenshot as soft backdrop art under the glass, palette glow when there is none. Icon 128px with the live ring. Pills row (Verified developer, Editors' choice, category). App name (`AppNameTitle`, `h1`). Summary. Install row: one dominant primary pill, Share and Save as quiet pills. `VersionAdvisory` directly above the install row, so a pulled or halted release is read before the button.
2. **Stat strip**: horizontally scrollable, snap-aligned glass tiles. Downloads (counter), Rating (number, star meter, count), Age rating, Size, Version and updated date, Compatibility. Provided fields only.
3. **Screenshots**, edge to edge, peek of the next, reserved aspect ratio. Collapses when there are none.
4. **About** with fade and a "Read more" pill.
5. **What's New** dropdown (kept) as a glass card with version and date pills, then `PermissionDiffNotice`.
6. **Information** glass list.
7. **Ratings and reviews.**
8. **Permissions** as grouped chips, only when provided.
9. **Rails**: more from this developer (if cheap), similar apps.
10. **Report a problem**, a quiet footer action.
11. `StickyInstallBar` (glass, icon and name, same progress behaviour) once the header's install row scrolls away.

**Desktop (1100px and up), two columns**

Main column on the left (screenshots, About, What's New, Information, Ratings, Permissions, rails, Report), a **sticky glass install card on the right** (icon, small name treatment, install button, Share, Save, size, version). The header glass card stays full width above both columns but without the install row, which moves to the side card. **One sticky thing per screen:** from 1100px the `StickyInstallBar` is hidden (the side card is the sticky install); below it the side card does not exist and the bar is used. The watcher on `#primary-install-row` keeps working because the phone header keeps that id.

**Tablet (768 to 1099px):** the phone column at a `max-width` of about 760px, centred; the stat strip no longer needs to scroll.

## 4. Tokens and motion

Defined once, in `components/glass/glass.module.css` (look) and the page's own stylesheet (layout).

- **Durations:** 160ms (hover, press, colour), 240ms (reveal of small things, dropdown), 420ms (panel and section reveal). `CountUp` keeps its own duration (1.4s, `DURATION_MS` in `components/CountUp.tsx`). **Ease-out:** `cubic-bezier(0.22, 1, 0.36, 1)`. **Spring-like, for press and confirm only:** `cubic-bezier(0.34, 1.56, 0.64, 1)`. The hero uses plain `ease` and `ease-out` today; migrate it to the tokens in Slice 7, not now (the hero must look identical after slice 0).
- **Animate only `transform` and `opacity`.** The ring animates an angle inside a mask; that is the one exception and it is already in the hero.
- **Reveal on scroll:** `ScrollReveal` first; `animation-timeline: view()` only as an upgrade under `@supports`.
- **Never:** sweeping flares, spotlight blobs, shimmer loops (a skeleton shimmer is allowed only while loading), particles, autoplay.
- **Reduced motion:** no animation, no parallax, no ring spin, no counter. **Reduced transparency:** solid panels and pills, art fades to 12%. **Increased contrast / forced colours:** solid backgrounds, visible borders, the name falls back to plain `CanvasText` (already in the shared layer).
- **Blur budget:** at most two or three blurred layers in one viewport. Today the header card is one (the panel), and pills add small ones; do not put a panel inside a panel, and do not animate a blurred element.

## 5. Theming rule: accent versus category skin

`CategoryThemeScope` wraps the page's `<main>` and re-defines `--color-bg`, `--color-surface`, `--color-accent`, `--color-accent-strong`, `--color-border` and `--gradient-vignette` for both themes. The shared layer's accent is `.scope` in `components/glass/glass.module.css`:

- **Dark:** `--glass-accent` and `--glass-accent-text` are both `var(--color-accent)`. With no skin that is gold; **inside a category skin it is the category's accent**, because the custom property is resolved where `.scope` sits, inside the wrapper. So in dark mode the skin tints the name's extrusion, the pills, the ring and the stars on the details page.
- **Light:** the fixed sky-blue pair: `#38bdf8` for decoration, `#0369a1` for anything that is text or a small graphic (5.9:1 on white; the decorative tone would be about 2:1 and must never be text). A category skin does **not** tint these in light mode.
- **Surfaces** (page background, panel tint, border) always follow the skin, because they read `--color-bg`, `--color-surface` and `--color-border`.
- **The app's own palette** (`primary_color`, `secondary_color`) is a soft glow behind the glass only, never a text colour.
- **The light-mode name has no colour at all** (clear frosted glass), in or out of a skin. `tests/glass-layer.test.ts` fails if an accent appears in its rules.

This is a decision, not the only possible one: if the operator wants the light accent tinted by the skin too, it is a one-block change in `.scope` and a test update.

## 6. Open point for the operator: the first-party rating histogram

The brief says `RatingSummary`'s first-party histogram is synthesized from the average and count (a deterministic Gaussian), not real votes. **Not verified in this slice** (the file was not opened; Slice 4 checks it first). The plan stands: show the average and count for first-party apps, and a per-star histogram only where real vote counts exist (third-party `votes`). Nothing invented is shown as real.

## 7. Shared primitives (built in slice 0)

All in `components/glass/`; look in `glass.module.css`, tiny components for what needs markup or logic. The home hero was moved onto them in the same patch and is meant to look identical.

| Piece | What it is |
|---|---|
| `.scope` (class) | The accent pair above. Put it on the element that wraps the glass pieces (the hero composes it; the details page header will). |
| `.panel` (class) | The glass panel: 46% surface tint, 22px blur with saturate, hairline accent border, inset rim and glow, radius from `--glass-radius` (default 28px). |
| `GlassPill`, `PillRow`, `PillMuted` | Transparent pills. Variants `default`, `accent`, `star`, `cta`. |
| `StarMeter` | Fractional five-star meter from an average (uses `ratingFillPercent`). |
| `AppNameTitle` | The app name as `h1`/`h2`/`h3`: dark solid with accent extrusion and bar, light clear frosted glass. Size from `--glass-name-size`. |
| `Tilt` (client) | Pointer tilt, depth parallax and rim position (generalised `HeroTilt`, which is deleted). |
| `IconRing`, `Rim` | The live arc round the icon and the pointer-following edge light. |

Still hero-specific, extract when the details page needs it: the backdrop art layer (`.art`, `pickHeroArt`), the icon float and glow, the stat column, the pulse.

## 8. Order of the slices

0. **This slice:** research and spec, shared glass primitives, hero moved onto them.
1. Immersive header and install row (adds `--app-*` page layout; `InstallButton` logic untouched; icon radius to about 30%).
2. Stat strip and Information list.
3. Screenshot gallery and lightbox.
4. Ratings and reviews, including the honest-histogram check.
5. About, What's New, permission chips, Report footer.
6. Rails, desktop two-column with the sticky install card, restyled `StickyInstallBar`.
7. Motion tokens everywhere, View Transitions, accessibility and contrast audit over worst-case art, dead-CSS cleanup (including the unused removed-section components if the operator confirms).
