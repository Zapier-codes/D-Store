# Prompt for the next session: rework the D-Store app details page

Paste everything below this line into the next session.

---

## 0. Your job in one paragraph

Rework the app details page (`/app/[slug]`, file `app/app/[slug]/page.tsx` and the components it renders) so that it feels like the home hero card we just finished: glass, depth, motion with purpose, big readable detail, no wasted space, and a few things neither Apple's App Store nor Google Play does. The target is an appealing, captivating product page that a visitor remembers, on a phone first and then on desktop. You are NOT starting from scratch on style: the hero card is the reference for look and feel, and section 3 lists exactly what it does and what we learned making it.

Clone `https://github.com/Zapier-codes/D-Store` first. Read `HANDOVER.md` (the START HERE block and the three STANDING OPERATOR INSTRUCTIONS, not the history), then `CHANGELOG.md`'s tail, then this prompt again.

---

## 1. Rules that come from the repo (follow them)

1. **Standing instruction (2026-10-02): do not run `npm ci`, `npm test`, `tsc`, `next build` or any build or test step.** Write the change, commit, hand over the patch, and say plainly in the commit message and the reply that nothing was run. The previous session broke this rule once; do not repeat that. If the operator lifts it in this session, run `npx tsc --noEmit` and `npm test` and report the real numbers.
2. **Delivery:** `git fetch origin` first and confirm your base is `origin/master`. Hand over **exactly one patch file** built with `git format-patch -1 HEAD --binary --stdout > /mnt/user-data/outputs/<000N>-<slug>.patch` (use `git format-patch origin/master --stdout` only if earlier patches are not on origin). Check that it applies on a fresh clone of origin before you hand it over. Give the operator these commands, with the real file name:
   ```
   cd ~/D-Store
   git am ~/storage/downloads/<file>.patch
   git push origin master
   ```
3. **Every session** updates `HANDOVER.md` (the START HERE block: rewrite, do not pile on) and appends one line to `CHANGELOG.md`, in the same commit as the code.
4. **Split big work.** This is several sessions of work. Do one slice per session (section 9), finish it, hand it over. Do not attempt the whole page in one go.
5. **No new dependencies.** CSS Modules, server components by default, small client islands only where behaviour needs them.
6. **Do not edit other repos** (Zealot, Storeapp) from a D-Store commit.
7. **Be honest in the reply:** what was written, what was not seen in a browser, what the operator must check by eye (the sandbox cannot open the live site).

---

## 2. What the page is today (audited; verify before relying on it)

`app/app/[slug]/page.tsx` (300 lines, a server component inside `CategoryThemeScope`) renders, in order:

1. `ViewPing`, `ViewHistoryRecorder`, `AppStructuredData` (invisible; keep all three).
2. **Header:** a 72px icon (96px from 768px up, `AppIconLive`), the name as an `<h1>` at `clamp(1.25rem, 5vw, 1.75rem)`, the summary, the developer link, a "Verified developer" badge, a plain-text stats row (`FirstPartyStats` for first-party apps, `ReportedStats` for third-party ones, content rating, "Editors' Pick" badge), `VersionAdvisory`, then the install row (`InstallButton` or `ThirdPartyDownloadButton`, `ShareButton`, `FavoriteButton`, a size/version/Android line) and `MonetizationDisclosure`.
3. **Screenshots** (`ScreenshotCarousel` + `Lightbox`), under a plain `<h2>`.
4. **About this app** (`ExpandableDescription`).
5. **What's New** (`Changelog`, a dropdown, closed on load) then `PermissionDiffNotice`.
6. **Ratings** (`RatingSummary`, `RateThisApp`, `ReviewsList`).
7. **Permissions** (`PermissionsDisclosure`, only when the source gave some).
8. **Report a Problem** (`ReportAppForm`).
9. **Similar Apps** (`Shelf`).
10. `StickyInstallBar` (fixed bottom bar that appears when the header's install row scrolls away; watches `#primary-install-row`).

`page.module.css` is 189 lines of plain flat layout: one column, `gap: 2rem`, every section a bare `<h2 class="sectionTitle">` at 1.1rem. There is no glass, no backdrop, no depth, no counter, no pills, no motion. The header is the weakest part: a small icon and small text where the hero card is now big and rich. The page and the hero card look like they come from two different products.

**Things the operator has already decided (do not undo):**
- Removed from the page: Version History, "Verify this APK", Play Store Status, Data Safety. The component files stay in place, unused.
- No source name and no "third-party" or "Aptoide" wording anywhere in the UI. Third-party apps still get their own Download button and reported figures, unlabelled.
- Anything the source did not provide is hidden, never shown as "Not provided" (Permissions section, content rating, licence, ads and purchases line). Use `isNotProvided(app, "<field>")` from `lib/trust.ts`.
- Light and dark follow the device (`[data-theme]` is set before first paint by `lib/theme.ts`). There is no theme button.

**Behaviour that must keep working exactly as it does now (these carry real logic):**
- `InstallButton`: the state machine (Checking, Install, Installing, Update, Open, Uninstall), the Android `intent:` deep links for Open and Uninstall, the `?reinstall=1` fallback, the store-owned download door `/api/apps/[slug]/download`, rollout bucketing, install counting. Restyle it; do not rewrite its logic. `StickyInstallBar` has its own instance.
- `CategoryThemeScope` re-skins accent and gradient per category (both themes). Your new design must still honour it.
- `AppStructuredData` (SEO), `ViewPing`, `ViewHistoryRecorder`, `VersionAdvisory` (pulled or halted release notice), the `notFound()` path.
- The page serves both first-party apps (origin `zealot`) and third-party ones. Both must look excellent. First-party apps may have no screenshots or icon; third-party ones have real `https://pool.img.aptoide.com/...` URLs.

**Tests that touch these components** (they may break when markup changes; fix them in the same patch, do not delete them): `tests/theme-contrast.test.ts` (fails on any text token under 4.5:1 and on any CSS module painting text with the border colour), `tests/count-up.test.ts`, `tests/carried-over-stats.test.ts`, `tests/hero-card.test.ts`, `tests/version-history-render.test.ts` (renders `VersionHistory` and imports `PermissionDiffNotice`'s CSS), `tests/catalog-detail.test.ts`, `tests/install-status.test.ts`.

---

## 3. The reference: what we built on the hero card, and what we learned

Read these files before designing: `components/Hero.tsx`, `components/Hero.module.css`, `components/HeroTilt.tsx`, `components/HeroCarousel.tsx`, `components/CountUp.tsx`, `components/FirstPartyStats.tsx`, `lib/hero-card.ts`, `lib/count-up.ts`.

**Techniques that worked (reuse the language, share the code):**
- **Glass panel:** `backdrop-filter: blur(22px) saturate(1.3)` over a 46% surface tint, a hairline accent border, an inset top rim and a faint inner glow, 28px radius.
- **Transparent pills for every button-like item:** 7% text-colour fill, 20% text-colour border, a small backdrop blur, an inset top highlight, 999px radius. Variants: accent (Featured), star, muted, and a visual "Get →" cue.
- **Animated downloads counter** in its own stat column (`CountUp`, tabular digits so nothing jitters, counts once on scroll into view, server renders the final text, screen readers get the final text, reduced motion skips it).
- **App name as 3D type.** Dark: solid `--color-text` with a stacked gold extrusion and a short gold bar. **Light: clear frosted glass**, a translucent white-to-grey gradient clipped to the letters, a fine neutral edge, a soft grey shadow, no colour at all.
- **Real screenshot as backdrop art** under the glass (`pickHeroArt`: https only, safe inside a CSS `url()`), so the panel's blur turns it into colour. Apps with no screenshot fall back to the palette glow.
- **Pointer tilt and depth parallax** (`HeroTilt` sets `--rx --ry --px --py --mx --my`; mouse only; off for touch and reduced motion).
- **Live icon ring:** a conic arc circling the icon via `@property --ring-angle`.
- **Fractional star meter** (`ratingFillPercent`: 4.6 fills 92%), an "Editors' choice" pill, an "Updated Oct 2026" pill (`updatedLabel`, UTC so server and browser agree).
- **Rim light** on the card's border ring that follows the pointer, mouse only.
- **Accessibility extras the stores do not have:** `prefers-reduced-transparency` fallback (solid panel, no blur), reduced-motion fallbacks, a card `aria-label` that includes rating and downloads.
- **Scoped accent:** `--hero-accent` (decoration) and `--hero-accent-text` (the deeper tone used where the accent is text or a small graphic). **Gold in dark; sky blue in light** (`#38bdf8` decorative, `#0369a1` for text, 5.9:1 on white).

**Mistakes we made and fixed (do not repeat):**
- A periodic light-flare sweep plus a mouse spotlight blob: they overlapped, the sweep snapped back to its start ("hooks"), and both were clichés. Replaced by the single thin rim light. **Do not add sweeping flares, spotlight blobs, shimmer loops or confetti.**
- App name as a gradient-clipped transparent fill in both themes: unreadable. Then dark ink plus a blue extrusion in light mode: heavy and wrong. The light-mode name must be clear glass with no colour.
- Decorative sky blue used as text on a white page (about 2:1): fails contrast. Always use the text-safe tone for text.

---

## 4. Research to do first (use web search; cite what you learned in the design note)

Spend the first part of the session on research and write the findings into `docs/DETAIL-PAGE-DESIGN.md` (a short design spec, see section 9). Do not skip this and do not copy; extract principles.

- **Apple App Store product page (web and iOS):** the horizontal ratings strip (rating, age, chart position, developer, language, size), how screenshots lead the page, the "What's New" block with a version and date, the Information list, the "More by this developer" and "You might also like" rails, the sticky "Get" button behaviour.
- **Google Play listing (web and app), including the 2025-2026 Material 3 Expressive changes:** the "About this app" and "Data safety" cards, the ratings-and-reviews layout with the histogram, the install button states and the expressive download progress ring around the icon, shape-morphing motion, pill buttons, the two-column desktop layout with a sticky install side card.
- **Others worth a look:** Samsung Galaxy Store, Huawei AppGallery, F-Droid, Microsoft Store, and a couple of best-in-class product pages from outside app stores (for hero treatment and scroll storytelling).
- For each, note: what to adopt, what to skip, and **where D-Store can beat it** (section 5). Also check current browser support for anything you plan to use (view transitions, `animation-timeline`, `@property`, `color-mix`, `backdrop-filter`, `mask-composite`) and give each a fallback.

---

## 5. Design direction: "beat the giants"

The north star is the hero card, extended into a full page. Concretely:

**A. Immersive header (the biggest single change).**
A full-width hero for the app, not a 72px icon row. The app's first screenshot (or, when there is none, its palette) is soft backdrop art under a glass panel, exactly the hero card's recipe. Big icon (at least 128px on phone, 160px on desktop) with the live ring. The name uses the hero's two treatments (dark: solid plus gold edge and bar; light: clear frosted glass, no colour). Developer link and Verified badge as pills. The stat strip (below) sits inside or directly under it. The install row becomes a row of transparent pills with one prominent primary action. Mirror the hero's pointer tilt and parallax on desktop mouse only.

**B. Stat strip with animated counters (beats Apple's ratings strip and Play's stats row).**
A horizontally scrollable, snap-aligned strip of glass tiles separated by hairlines: **Downloads** (big `CountUp`), **Rating** (big number plus the fractional star meter and count), **Age rating** (only when provided), **Size**, **Version and updated date**, **Compatibility** (only when provided). Each tile is one big figure and one small label, no wasted space. Third-party apps use `ReportedStats` data in the same tiles, unlabelled as to source.

**C. Screenshot gallery (beats both stores).**
Larger, edge-to-edge on phones with a peek of the next shot, scroll-snap, handles portrait and landscape screenshots with a reserved aspect ratio (no layout shift), blurred ambient backdrop that changes with the active shot, a subtle tilt on the focused shot on desktop, keyboard and swipe support, and a polished lightbox (swipe, pinch if cheap, arrow keys, focus trap, Escape). Skeleton shimmer is allowed only while loading. When an app has no screenshots, do not show an empty section: collapse it.

**D. About, What's New, Information.**
"About this app" with a gradient fade and a pill "Read more". "What's New" stays a dropdown (the operator asked for that) restyled as a glass card with a version pill and date pill. Add an **Information** glass list (Apple's best idea): developer, category, size, version, updated, minimum Android, licence, content rating, only the fields the source provided. No "Not provided" rows.

**E. Ratings and reviews (beats Play's flat histogram).**
A large animated average (counter), the fractional meter, and histogram bars that grow in when scrolled into view (reduced motion: static). `RateThisApp` gets a satisfying star picker (hover fill, press feedback, a tiny confirm animation). Reviews as glass cards. **Before building: check whether the first-party histogram is still synthesized from the average and count (the `RatingSummary` header comment says it is a deterministic Gaussian, not real votes). Showing invented per-star counts as if real is misleading. Raise it with the operator in the reply and, unless told otherwise, show the histogram only where real vote counts exist (third-party `votes`) and show just the average and count for first-party apps.** Do not fabricate anything.

**F. Permissions as readable chips.**
Group permissions into plain-language groups with small icons (Camera, Location, Storage, Network, ...), rendered as transparent pills, only when the source provided permissions. Keep `PermissionDiffNotice` right under What's New.

**G. Rails.**
"More from this developer" (if cheap with existing data) and "Similar apps" using the same glass card and pill language as the hero. Decide whether to reuse `Shelf` or restyle `AppCard`; keep the existing empty-state rule (render nothing when empty).

**H. Report a Problem** collapses to a quiet footer action that expands in place; it must not compete with the install action.

**I. Desktop two-column layout (beats both stores).**
From about 1100px: main content on the left, and a **sticky glass install card on the right** holding icon, name (small treatment), the install button and pills, size, version, Share, Save. On phones, the `StickyInstallBar` remains (restyled as glass, with the icon and name, and the same progress behaviour). Do not duplicate two sticky things on one screen.

**J. Motion system (one set of rules, used everywhere).**
Define a few shared tokens (durations about 160, 240, 420 ms; one ease-out curve; one spring-like curve for press and confirm). Reveals on scroll use the existing `ScrollReveal` pattern or `animation-timeline: view()` with an `IntersectionObserver` fallback. Optional progressive enhancement: **View Transitions** so the icon and name glide from the card the visitor tapped (`view-transition-name` on icon and name, wrapped in `@supports`, never required). Everything honours `prefers-reduced-motion` (no animation, no parallax, no ring spin) and `prefers-reduced-transparency` (solid panels, no blur).

**K. Theming rules (strict).**
Generalise the hero's scoped accent into a page-level pair (for example `--app-accent` and `--app-accent-text`): gold in dark, sky blue in light, text-safe tone for anything that is text or a small graphic, and keep the per-app palette (`primary_color`, `secondary_color`) as a soft glow only, never as text colour. `CategoryThemeScope` must still be able to re-skin, so decide and document how its accent and the app-level accent interact (category skin wins on surfaces, the gold/sky pair wins on the name and pills unless a category skin is active; write the rule down and test it by reading the CSS in both modes). The app name keeps the two treatments from the hero.

---

## 6. Architecture

- **Extract shared primitives instead of copying the hero's CSS.** Create a small shared layer, for example `components/glass/` with `glass.module.css` (glass panel, pill and pill variants, rim, ring, stars) and tiny components where logic is needed: `GlassPill`, `StarMeter` (uses `ratingFillPercent`), `AppNameTitle` (the two-theme 3D/glass name, taking the heading level), `Tilt` (generalise `HeroTilt`; keep `HeroTilt` working or migrate the hero to the shared one in the same patch). The hero and the details page must look like one family because they share code.
- **Server by default.** New client islands only for: the counter (`CountUp`, exists), tilt (exists), the screenshot gallery and lightbox (already client), the star picker, the sticky bar, the expand/collapse controls. Pure helpers go in `lib/` with `node:test` tests in `tests/` (pattern: `lib/hero-card.ts` and `tests/hero-card.test.ts`).
- **Data:** use only fields that exist on `App` (`lib/mock-data.ts`), via `lib/carried-over-stats.ts` (`combinedDownloadTotal`, `combinedRating`, `formatDownloadCount`) for first-party figures and `reportedStatsFor` for third-party ones. Do not invent fields, ratings, reviews, counts or dates.
- **Files:** keep `page.tsx` thin (data fetching and composition), move each section into its own component with its own CSS module, delete dead CSS when a section is replaced. Do not leave two competing header implementations.
- **Naming and comments:** follow the repo's style (leaf path or "operator-directed, 2026-10-xx" in file header comments; say why, not just what).

---

## 7. Accessibility and performance budgets (non-negotiable)

- WCAG AA: text 4.5:1, large text and graphics 3:1, in **both** themes, over the real backdrop art (the art is under a blurred glass panel; still check the worst case, a bright screenshot in light mode and a dark one in dark mode). `tests/theme-contrast.test.ts` must still pass: no text painted with the border colour, no text token under 4.5:1.
- Visible focus rings on every control (use the text-safe accent), full keyboard operation of the gallery, lightbox, dropdowns and star picker, correct roles and labels, one `<h1>`, a sensible heading order.
- `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast`, and `forced-colors` each get a deliberate fallback (solid backgrounds, visible borders, no clipped-text name in forced colours: fall back to plain `currentColor`).
- Performance: the icon is the LCP candidate (`priority`); backdrop art and below-the-fold screenshots are lazy; reserve aspect ratios so there is no layout shift; limit stacked `backdrop-filter` layers to what a mid-range phone can draw (no more than two or three blurred layers in one viewport; do not animate blurred elements); animate only `transform` and `opacity`; no new JavaScript bundle weight beyond small islands.
- Responsive: design at 360px first, then 768px, then 1100px and above. No horizontal page scroll (wide content scrolls inside its own container). Respect safe-area insets (the existing page already clears the sticky bar and the iOS home indicator).

---

## 8. What not to do

- No sweeping flares, spotlight blobs, shimmer loops, particle effects or autoplaying anything that distracts from reading.
- No colour in the light-mode app name (clear glass only); no dark-ink name with a coloured shadow.
- No text in decorative-only accent tones; no per-app colour as text.
- No fake data, no synthesized votes shown as real, no "Not provided" placeholders, no source or "third-party" wording.
- Do not change the behaviour of install, deep links, downloads, rollout, counters, view pings, structured data or the pulled/halted advisory.
- Do not bring back the removed sections (Version History, Verify this APK, Play Store Status, Data Safety).
- Do not touch other repos, and do not force-push.

---

## 9. Plan: slices, one per session (each ends in one patch)

**Slice 0 (do first, short): research and spec.** Web research per section 4, then write `docs/DETAIL-PAGE-DESIGN.md`: findings (a few lines per store), the chosen layout for phone and desktop, the token and motion rules, the theming rule for accent versus category skin, the list of shared primitives, and the order of the slices. Also extract the shared glass primitives (`components/glass/`) and move the hero onto them (the hero must look identical afterwards). One patch.

**Slice 1: immersive header and install row.** New header (section 5A), restyled install row (pills; `InstallButton` logic untouched), backdrop art, ring, the two-theme name, the Verified and Editors' pills, `VersionAdvisory` placement.

**Slice 2: stat strip and Information list** (5B, 5D).

**Slice 3: screenshot gallery and lightbox** (5C).

**Slice 4: ratings and reviews** (5E), including the honest-histogram decision.

**Slice 5: About, What's New, Permissions chips, Report footer** (5D, 5F, 5H).

**Slice 6: rails, desktop two-column layout with the sticky install card, restyled `StickyInstallBar`** (5G, 5I).

**Slice 7: motion pass and View Transitions, accessibility pass, contrast and reduced-motion audit, dead-CSS cleanup** (5J, section 7).

If the operator names a different order or a single slice, follow that. Say at the end of each slice what is done and what the next slice is, and rewrite the START HERE block of `HANDOVER.md` so the following session can pick up without rediscovery.

---

## 10. Acceptance checklist (use it before handing over each slice)

- [ ] It looks like the same product as the home hero card, in both themes.
- [ ] The app name uses the dark (solid plus gold edge) and light (clear frosted glass) treatments; no colour in light mode.
- [ ] No wasted space: every region carries information or deliberate breathing room.
- [ ] Every button-like item is a transparent glass pill; one primary action is clearly dominant.
- [ ] Counters animate once on scroll, final text is in the server HTML, reduced motion skips them.
- [ ] Contrast is AA in both themes over worst-case backdrops; focus rings visible; keyboard works.
- [ ] Reduced motion, reduced transparency, high contrast and forced colours each have a fallback.
- [ ] First-party app with no screenshots, first-party app with screenshots, and a third-party app all render well; empty sections collapse; nothing says "Not provided" or names a source.
- [ ] Install, Open, Update, Uninstall, deep links, downloads, sticky bar, structured data and view pings are behaviourally unchanged.
- [ ] No sweeping flare, spotlight, or shimmer loop anywhere.
- [ ] Existing tests are updated (not deleted); new pure helpers have tests.
- [ ] `HANDOVER.md` START HERE rewritten, `CHANGELOG.md` line added, one patch built against `origin/master` and checked to apply on a fresh clone.
- [ ] The reply says plainly what was written, what was run (nothing, unless the operator lifted the rule), what was not seen in a browser, and what the operator must check by eye after the Vercel deploy, with the exact `git am` and `git push` commands.

---

## 11. Questions for the operator (ask at most one, and only if truly blocking; otherwise state your assumption and proceed)

- Should the light-mode name on the details page be the same clear frosted glass as the hero card? (Assumed: yes.)
- Is a desktop two-column layout with a sticky install card wanted? (Assumed: yes, from 1100px.)
- If the first-party rating histogram is synthesized, should it be hidden? (Assumed: yes, until real votes exist.)
