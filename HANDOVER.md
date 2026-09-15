# D-Store — HANDOVER.md
*Read this file first, every session. It tells you exactly what to work on and how to hand off when you're done.*

---

## 0. How this file works

Work is broken into a fixed hierarchy:

```
Phase        1, 2, 3, 4
 └─ Track     a, b, c, d
     └─ Milestone   i, ii, iii
         └─ Leaf        zi, zo
```

A **leaf** (`zi` or `zo`) is always exactly **one task**. That is the rule: no leaf ever bundles more than one task, and no leaf is ever split into less than one. A session's job is to take **the single next open leaf**, complete it, and hand off — never more than one leaf, never a partial leaf.

Each leaf is addressed by its full path, e.g. `1.a.i.zi`. Use that path in commit messages, patch filenames, and status updates so any future session can locate exactly where work stands.

### Status markers
Every leaf carries one of:
- `[ ]` open — not started
- `[~]` in progress — a session started but did not finish (should be rare; a leaf is sized to finish in one session)
- `[x]` done — completed and handed off via patch (see Section 3)

### Architecture pivot (resequencing note)

The Symfony/Doctrine backend is no longer the direction of record. Going forward:
- **Supabase (Postgres)** is the metadata store only — app info, ratings, counters, developer/agreement status. It never holds APKs or other release binaries.
- **GitHub Releases** is the binary store *and* the source of usage metrics — it already exposes per-asset download counts natively, so those feed install/trending numbers instead of a custom increment endpoint built against Doctrine.

Because of this, Phase 1.a leaves already completed or in flight against the Doctrine `Application` entity (`1.a.i.zi`, done via Doctrine/YAML mapping) will need to be re-expressed against the Supabase schema once `5.f.i` lands — they are not being redone right now, just noted as superseded-pending-migration. New leaves should not add further Doctrine-only data model work until the Supabase schema exists.

Sequencing is overridden below: the next leaves pull forward from Phase 5 (`5.f` — Catalog Database & Platform Risk) rather than continuing further down Phase 1 in path order.

**Storage roles (update):** the Telegram S3-compatible drive is **primary** storage for APKs/splits — it's existing infrastructure that has been continuously active, not something to newly deploy. Telegram's job is storage only: it holds the finished assets and nothing else. The entire build/sign/split/checksum/changelog/catalog-sync pipeline runs end to end inside one GitHub Actions workflow, with the assets attached to that workflow run throughout — the workflow's final step is the one that releases the finished artifacts to the Telegram drive. GitHub Releases is **not** used to store or serve app binaries. The Cloudflare edge worker fronts the Telegram drive as the sole storage backend, with no GitHub fallback. This is reflected in the revised `5.a`–`5.c`, `5.f`, and `5.g` leaves below.

**Priority override — UI revamp first:** before any further backend/infra work, the storefront UI gets rebuilt end to end on dummy data and deployed to Vercel for real-time preview. See the new **Phase 0** at the top of Section 2. It pulls forward the UI-facing leaves from Phase 1 (`1.b`–`1.d`) and Phase 2 (`2.a`–`2.c`), so those original leaves are marked superseded rather than duplicated — check them off once their Phase 0 counterpart ships. Backend/infra sequencing (starting at `5.f.i.zi`, provision Supabase) resumes once Phase 0 is complete.

**Repo layout (update, part of `0.a.i.zi`):** the Next.js app now lives at the **repo root** (`package.json`, `app/`, `next.config.mjs`, `tsconfig.json`), not a `frontend/` subdirectory — this lets Vercel auto-detect the framework on import with zero manual configuration, permanently, not just on the first import. The old Symfony app (`app/`, `src/`, `web/`, `composer.json`) was moved into **`legacy-symfony/`** to make room; its internal relative paths (composer autoload, kernel bootstrap, parameters file) are all resolved relative to `legacy-symfony/composer.json` itself, so nothing inside it needed to change. Their internal Linux server deployment for the Symfony app should point at `legacy-symfony/` going forward.

**Scope addition — Geo-regionalization foundation (`0.h`, new):** future sessions need to build region-aware catalogs (Play-Store-style per-country listings/availability) on top of the real backend once it exists. To make that possible without a rewrite later, Phase 0 gains a new `0.h` track: a global **ipapi.co** IP-geolocation client, wired in now while the rest of the UI is still dummy-data-only.

- This is a deliberate, single, narrow exception to Phase 0's "no real backend calls" rule stated at the top of Section 2 — ipapi.co is locale/geolocation detection, not catalog/store data, so it doesn't reintroduce a Supabase/Telegram/Doctrine dependency. The catalog itself stays on `lib/mock-data.ts` (plus a new dummy `available_regions` field) until Phase 5 lands real data.
- **ipapi.co's free tier is explicitly not meant for production** — up to ~1,000 lookups/day (~30K/month), positioned by ipapi.co as a testing/evaluation plan, not a deployment plan. The client (`0.h.i.zi`) must (a) fail soft to a default region on any error/429/timeout — never block rendering — and (b) cache the detected region (e.g. a cookie or edge-cached response) so it's looked up once per visitor session, not on every request. Moving to a paid ipapi.co plan, or swapping the client for a Vercel/Cloudflare edge geolocation header instead, is an open question for whoever picks up production-readiness — noted here, not decided.
- Placed as `0.h` (after `0.g`) rather than resequenced to the front: nothing already planned in `0.a`–`0.g` depends on it, so it doesn't jump the queue — it just needs to land sometime during Phase 0 so the leaves after Phase 0 (real backend, Supabase) can build region-aware queries against a catalog shape that already has a `available_regions` field and a working region-detection hook.

### Current position

> **Next leaf to work: `1.a.iii.zo`** *(Phase 1 — Foundation, Data Model Migration, New entities — Create `ReportFlag` entity (anonymous app reports), closing out `1.a.iii` and all of `1.a`. `5.f.i.zi` — provision Supabase — remains gated behind Phases 1–4 per existing ordering.)*
> *(Update this line every session — see Section 3, step 4.)*

---

## 1. The Rule, stated plainly

**Every session does exactly one leaf task. No more, no less.**

- Do not start a second leaf even if time/context remains — end the session, hand off, let the next session pick up `zo` or the next milestone.
- Do not leave a leaf half-done. If a leaf turns out to be bigger than one session, stop and split it into a new sub-leaf pair before writing any code, then hand off the split itself as the session's one task.
- Always re-read "Current position" before doing anything else.

---

## 2. Full Task Hierarchy

### Phase 0 — UI Revamp (PRIORITY — supersedes prior sequencing until complete)

*Added by resequencing. Full storefront UI, live-previewable on Vercel, running entirely on dummy/mock data seeded from the apps currently in the catalog — no real backend calls (no Supabase, no Telegram, no Doctrine) at this stage. Every data-dependent interaction (install button, ratings, search, filters, report form) uses local dummy logic so the whole app is clickable and visually complete. This becomes the working roadmap/reference for what the real backend (Phase 5 infra, Supabase, etc.) needs to eventually support underneath. Once Phase 0 is complete, sequencing resumes at `5.f.i.zi` (provision Supabase) so real data gets wired in behind the same interfaces established here.*

**0.a — Vercel Project & Preview Pipeline**
- 0.a.i — Frontend scaffold & deploy
  - [x] 0.a.i.zi — Initialize the new frontend project and connect the repo to Vercel for automatic preview deploys on every push (Next.js app at repo root — moved out of `frontend/` so Vercel needs zero manual configuration, ever, not even on first import; old Symfony app relocated to `legacy-symfony/`; account owner completed the one-time Vercel dashboard import per `docs/VERCEL-SETUP.md` — confirmed live at https://d-store-nu.vercel.app/, serving the expected Phase 0 placeholder page)
  - [x] 0.a.i.zo — Confirm a live preview URL renders end-to-end on a placeholder page before building real UI on top of it (fetched https://d-store-nu.vercel.app/ — served HTML matches `app/page.tsx`/`app/layout.tsx` in the repo exactly: title, meta description, and placeholder copy all render correctly from `master`)
- 0.a.ii — Dummy data layer
  - [x] 0.a.ii.zi — Mock dataset covering every app currently in the catalog, shaped to match the full field set (`install_count`, `avg_rating`, `rating_count`, `is_featured`, `is_editors_pick`, `sha256_checksum`, etc.) — `lib/mock-data.ts`, seeded from the real legacy `Application`/`Category` entity fields and the actual apps/categories visible in `screenshot_1.png`/`screenshot_2.png` (13 real apps: F-Droid plus the 12-app Theming shelf); new fields not in the old entity are dummy values, clearly marked as such in the file's header comment
  - [x] 0.a.ii.zo — Local data-fetch layer that serves the mock dataset behind the same interface a real API/Supabase client will use later, so swapping in real data later is a drop-in change, not a rewrite — `lib/catalog.ts`: `getCategories`, `getCategoryBySlug`, `getCategoryAppCount`, `getApps`, `getAppBySlug`, `getFeaturedApps`, `getTrendingApps`, `getEditorsPicks`, `getNewAndUpdated`, `searchApps`, `getSimilarApps` — all async with simulated latency so loading states can be built against it now; callers should import this, never `lib/mock-data.ts` directly

**0.b — Design Tokens** *(pulls forward `1.b`)*
- 0.b.i — Dark theme, "Cinematic Gold"
  - [x] 0.b.i.zi — Define color tokens (bg, surface, accent, border) — `app/globals.css`, scoped under `[data-theme="dark"]` so the upcoming light theme (`0.b.ii`) can coexist without collision; `app/layout.tsx` now sets `data-theme="dark"` on `<html>` (hardcoded until `0.b.iii` adds persistence/toggle) and imports the stylesheet
  - [x] 0.b.i.zo — Define vignette/gradient background treatment — `app/globals.css`: `--gradient-vignette` (soft warm-gold glow near the top fading into a darkened edge, composed from `--color-accent`/`--color-bg`), applied to `body` via `background-image`; exposed as a token so other components (e.g. the hero, `0.d.i`) can reuse it
- 0.b.ii — Light theme, "Scientific Blue"
  - [x] 0.b.ii.zi — Define color tokens — `app/globals.css`: `[data-theme="light"]` block with `--color-bg`, `--color-surface`, `--color-accent` (cobalt), `--color-border`, mirroring the dark theme's token shape; inert until `0.b.iii` wires up the toggle
  - [x] 0.b.ii.zo — Contrast-check accent variants (WCAG AA) — `app/globals.css`: computed ratios documented inline; base `--color-accent` #2454c9 already clears AA (6.20:1 vs bg, 6.59:1 vs surface/white text); added contrast-checked `--color-accent-strong` #1a3d99 (9.10:1 / 9.67:1) for hover/active/pressed states
- 0.b.iii — Theme persistence
  - [x] 0.b.iii.zi — Theme storage + read on load (no flash) — `lib/theme.ts`: cookie-based storage (`d-store-theme`, 1yr, no accounts so no server-side per-user store), `getTheme()` read server-side, `setThemeCookie()` server action for the future toggle (0.c.i.zo); `app/layout.tsx` now reads it and sets `data-theme` on `<html>` before HTML reaches the client — no client-side swap, no flash. Note: this makes routes render dynamically (`ƒ`) instead of statically (`○`), since the layout now depends on the request's cookies
  - [x] 0.b.iii.zo — Theme toggle transition animation — `app/globals.css`: `body` gets `transition: background-color 200ms ease, color 200ms ease`, gated behind `@media (prefers-reduced-motion: no-preference)`; `background-image` (the vignette) intentionally not transitioned since browsers don't interpolate between distinct gradients. Distinct from `0.b.iii.zi`'s no-flash-on-load guarantee — this smooths the swap once a visitor actually toggles, via the future `0.c.i.zo` control

**0.c — Core Layout Shell** *(pulls forward `1.c`)*
- 0.c.i — Header
  - [x] 0.c.i.zi — Responsive nav + search bar — `components/Header.tsx` + `Header.module.css`, rendered from `app/layout.tsx` above `{children}` so it's on every page; mobile nav collapse uses the checkbox-hack (no client JS), search is a plain GET form to `/search?q=...` (page doesn't exist yet — lands in `0.g.i.zo`); styled entirely from the `0.b` design tokens so it re-themes automatically once the toggle (`0.c.i.zo`) lands
  - [x] 0.c.i.zo — Theme toggle integration — `components/ThemeToggle.tsx` (client component, sun/moon button) added to the header's nav; calls the `setThemeCookie` server action (`lib/theme-actions.ts`, split out from `lib/theme.ts` since a `"use server"` module can only export async functions) then `router.refresh()` so the server-rendered `data-theme` picks up the new cookie — the fade itself is `0.b.iii.zo`'s existing CSS transition, this component only triggers the swap; `theme` is threaded down from `app/layout.tsx`'s single `getTheme()` read, not tracked as separate local state
- 0.c.ii — Grid system
  - [x] 0.c.ii.zi — Responsive shelf-grid (2→6 columns) — `components/ShelfGrid.tsx` + `ShelfGrid.module.css`: explicit 2/3/4/6-column breakpoints (not auto-fill/minmax) for predictable Play-Store-density at every size, per D-STORE.md §3. Not wired into any page yet — it's the shared layout primitive for the dense app-card (`0.c.ii.zo`, next) and later shelves/category grid (`0.d`, `0.g.ii.i`)
  - [x] 0.c.ii.zo — Small/dense app-card component — `components/AppCard.tsx` + `AppCard.module.css`: icon (colored initial tile from the app's dummy `primary_color`/`secondary_color`, since no real icon image assets exist in the repo yet), 2-line-clamped name, and a rating line (★ `avg_rating` + an "Editors' Pick" badge when `is_editors_pick`) — nothing else, per D-STORE.md §3's "small, dense cards" rule. Whole card links to `/app/[slug]` (not built yet, lands in `0.e`). Built on the `App` type from `lib/catalog.ts`; not wired into any page yet — that's `0.d`'s shelves and `0.g.ii.i`'s category grid, both of which now have their card primitive ready
- 0.c.iii — Footer
  - [x] 0.c.iii.zi — Legal links (Privacy, Terms, DMCA) — `components/Footer.tsx` + `Footer.module.css`, rendered from `app/layout.tsx` below `{children}` so it's on every page; styled entirely from the `0.b` design tokens (same convention as `Header.tsx`) so it re-themes automatically. `/privacy`, `/terms`, `/dmca` don't exist as real pages yet — same forward-reference pattern already used for `/search`/`/categories`, they'll 404 until a later leaf builds them
  - [x] 0.c.iii.zo — RSS link + "no account required" notice — extended `components/Footer.tsx`: copy line now reads "No account required" alongside the existing copyright, and a fourth link (`/feed.xml`) added to the legal nav for the future RSS/Atom feed. `/feed.xml` is forward-referenced the same way `/privacy`/`/terms`/`/dmca` are — the real feed is a Section-4 feature (`4.c.i.zi`, new & updated apps), not built here

**0.d — Home Page** *(pulls forward `1.d`, dummy data)*
- 0.d.i — Hero
  - [x] 0.d.i.zi — Cinematic hero for one featured app (from dummy data) — `components/Hero.tsx` + `Hero.module.css`, wired into `app/page.tsx` (replacing the Phase 0 placeholder confirmed live by `0.a.i.zo`) via `getFeaturedApps()`, first result. The one deliberate glassmorphism moment per D-STORE.md §4C: a frosted `.panel` (icon, name, summary, rating/install-count/license meta, forward-referenced `/app/[slug]` CTA) over a full-bleed background gradient built from the app's own dummy `primary_color`/`secondary_color`/`tertiary_color` fields plus the existing `--gradient-vignette` token, since no real banner art exists yet. No reveal animation — that's `0.d.i.zo`, next.
  - [x] 0.d.i.zo — Reveal animation (respects `prefers-reduced-motion`) — `Hero.module.css`: `.panel`/`.icon` play a one-shot fade/translate-up `animation` on first paint (the hero is above the fold, so "reveal" here means on-mount, not scroll-triggered — nothing to scroll past first), gated behind `@media (prefers-reduced-motion: no-preference)`, the same guard already used by the theme-transition (`0.b.iii.zo`) and mobile nav collapse. `both` fill-mode avoids a flash of the un-animated state on either edge. Pure CSS — no client boundary added to `Hero.tsx`.
- 0.d.ii — Shelves
  - [x] 0.d.ii.zi — Featured shelf — `components/Shelf.tsx` + `Shelf.module.css`: reusable titled-shelf wrapper (heading + `ShelfGrid`/`AppCard`, 0.c.ii) so the shelves that follow (Trending, Editor's Picks) reuse it instead of re-deriving the markup; renders nothing when given an empty `apps` array (e.g. a future region filter narrows a shelf to zero, 0.h.ii.zo) rather than an empty heading. Wired into `app/page.tsx` below the hero, reusing the existing `getFeaturedApps()` call already made for the hero (first result → hero, remainder → shelf) rather than a second fetch, so the hero's app isn't duplicated directly beneath it. `next build` passes clean.
  - [x] 0.d.ii.zo — Trending shelf (sorted by dummy `install_count`) — `app/page.tsx`: second `Shelf` (0.d.ii.zi) below Featured, fed by `getTrendingApps()`, fetched alongside `getFeaturedApps()` via `Promise.all` rather than sequentially. Trending is a separate fetch, not a slice of the Featured result — it's a different sort dimension (`install_count`, not the `is_featured` flag), so the two shelves can legitimately overlap. No client-side sort needed: `getTrendingApps()` in `lib/catalog.ts` already returns apps ordered by `install_count` descending. `next build` passes clean.
- 0.d.iii — Editorial
  - [x] 0.d.iii.zi — Editor's Picks shelf — `app/page.tsx`: third `Shelf` (0.d.ii.zi) below Trending, fed by `getEditorsPicks()`, fetched alongside the other two via the same `Promise.all`. Filtered on the dummy `is_editors_pick` flag — a third independent dimension from both `is_featured` and `install_count` — so fetched separately rather than derived from either existing list; individual cards already surface an "Editors' Pick" badge (`AppCard`, 0.c.ii.zo) when an app also appears in Featured/Trending, this shelf is the dedicated curated collection. `next build` passes clean.
  - [x] 0.d.iii.zo — Sponsored card slot (dummy/native placeholder, clearly labeled) — `components/SponsoredCard.tsx` + `SponsoredCard.module.css`: markup/CSS classes mirror `AppCard` one-for-one (icon tile, clamped name, meta line) so it's shape/theme-identical to an organic card per D-STORE.md §6, with a `Sponsored` badge replacing the rating as the "clearly labeled" element (dashed accent border as the one other visual tell); plain non-link `<div>`, not a `<Link>`, since there's no real click-through yet. Dummy content lives inline in the component rather than `lib/mock-data.ts`, since a sponsored slot isn't a catalog `App` (no slug/detail page/rating) and mixing it into the real `App[]` would leak a fake entry into search/trending/category logic. `Shelf.tsx` gained a new optional `extraSlot: React.ReactNode` prop (generic, no sponsored-specific knowledge) rendered inside its `ShelfGrid` after the mapped `AppCard`s; `app/page.tsx` passes `<SponsoredCard />` as the Editor's Picks shelf's `extraSlot`, so it's woven in after the curated picks rather than reordering them. `next build` passes clean.

**0.e — App Detail Page** *(pulls forward `2.a`, dummy data)*
- 0.e.i — Media
  - [x] 0.e.i.zi — Screenshot carousel — `components/ScreenshotCarousel.tsx` + `.module.css`: pure server component, swipeable via native CSS scroll-snap (`overflow-x: auto` + `scroll-snap-type: x mandatory`/`scroll-snap-align`) rather than a client carousel lib or touch handlers, matching the repo's existing preference for CSS-only interaction. Since no real screenshot image assets exist yet (`App.screenshots` are dummy `/mock/...` paths, same gap Hero.tsx already notes for banner art), each slide is a colored placeholder tile cycling the app's `primary_color`/`secondary_color`/`tertiary_color` fields — same convention as AppCard's/Hero's icon tiles. This leaf also creates the `/app/[slug]` route itself (`app/app/[slug]/page.tsx` + `page.module.css`) — the first 0.e leaf, and every card/hero link built so far (AppCard 0.c.ii.zo, Hero 0.d.i.zi) has pointed here as a forward reference since it didn't exist; `notFound()` on an unknown slug, `getAppBySlug` for lookup. Page currently renders just a minimal header (icon/name/summary) plus the carousel — remaining 0.e/0.f/0.g leaves append further sections here, the same incremental pattern `app/page.tsx` followed across 0.d. `next build` passes clean; manually verified `/app/f-droid` renders both of F-Droid's dummy screenshots and `/app/does-not-exist` 404s.
  - [x] 0.e.i.zo — Lightbox viewer — `components/Lightbox.tsx` + `.module.css`, opened from `ScreenshotCarousel.tsx` (which gains a `"use client"` boundary and turns each slide into a real `<button>` to trigger it at that slide's index — the swipe track's CSS scroll-snap behavior from `0.e.i.zi` is unchanged). Built on the native `<dialog>` element (`showModal()`) rather than a hand-rolled modal/portal, matching the repo's existing preference for native platform behavior: focus trapping and Escape-to-close come for free, only arrow-key prev/next and click-outside-to-dismiss needed explicit handlers. Same placeholder-tile/color-cycle convention as the carousel, just rendered larger; fade/scale-in on open is gated behind `prefers-reduced-motion`, the same convention as `0.b.iii.zo`/`0.d.i.zo`. `next build` passes clean; manually verified `/app/f-droid` renders both screenshots as buttons with the expected accessible labels.
- 0.e.ii — Content
  - [x] 0.e.ii.zi — Expandable description — `components/ExpandableDescription.tsx` + `.module.css`, added as an "About this app" section on the detail page after Screenshots. Collapsed state shows `App.description` as plain text clamped to 4 lines (`-webkit-line-clamp`); expanded state re-renders the same string with its actual paragraph/bullet structure (blank-line-separated paragraphs, "- " bullet lines — F-Droid's entry, transcribed from the app-detail screenshot, is the clearest example). "Read more"/"Read less" toggle button only renders past a length heuristic (220 chars) so short one-line summaries (Simply Solid, Battery Live) don't get a pointless button. `next build` passes clean; manually verified via `next start` that `/app/f-droid` (long description) renders the toggle and `/app/simply-solid` (short) doesn't.
  - [x] 0.e.ii.zo — "What's New" changelog block — `components/Changelog.tsx` + `.module.css`, a "What's New" section on the detail page after "About this app." Pure server component (no interaction needed, unlike ExpandableDescription) pairing `App.version`/`App.updated_at` (formatted via `toLocaleDateString`) with the single `App.changelog` release-notes line — there's no changelog *history* array in the data model yet, so only the latest entry renders; a real backend would need a `changelog[]`/release-history shape to show more, noted as out of scope here. `next build` passes clean; manually verified `/app/f-droid` renders "Version 0.102", "November 30, 2016", and the changelog text correctly.
- 0.e.iii — Ratings
  - [x] 0.e.iii.zi — Rating stars + histogram (dummy data) — `components/RatingSummary.tsx` + `.module.css`, a "Ratings" section on the detail page after "What's New." Average score + continuous-fraction star fill (clipped foreground glyph over a muted background glyph, so e.g. 4.6 renders 4 full stars + a 5th filled 60%, not just full/half/empty) plus a 5-bucket histogram. `App.avg_rating`/`App.rating_count` are aggregate-only fields (same gap the legacy entity had — no per-star breakdown, no `Review` entity yet per docs/D-STORE.md §7), so the histogram is synthesized deterministically via a fixed Gaussian kernel centered on `avg_rating` — not random, so it's stable across renders — with bucket counts corrected to sum exactly to `rating_count`. Verified the sum-preservation and shape of the synthesis in isolation (4.6★/3021 → 1419/1254/323/24/1, sums to 3021) plus `next build` clean and manual check that `/app/f-droid`'s histogram aria-label matches.
  - [x] 0.e.iii.zo — Anonymous rating submission (dummy — updates local state only, no backend) — `components/RateThisApp.tsx` + `.module.css`, a "Rate this app" star picker + submit button below the histogram in the Ratings section. Picking a star and submitting only updates this component's own local `submitted` state to show a "Thanks for rating" confirmation — deliberately does NOT reach up into RatingSummary (0.e.iii.zi) to recompute the displayed average/histogram, since faking that merge convincingly is a real backend concern, not a better dummy. Anonymous — no identity check, nothing stops submitting more than once, matching the leaf name (rate-limiting is explicitly a Phase 5/`Review`-entity concern per docs/D-STORE.md §7). `next build` passes clean; manually verified via `next start` that `/app/f-droid` renders the star picker (`radiogroup`) and submit button in initial SSR HTML.

**0.f — Trust & Safety UI** *(pulls forward `2.b`, display-only, dummy data)*
- 0.f.i — APK verification
  - [x] 0.f.i.zi — SHA256 checksum display (dummy value) — `components/ChecksumDisplay.tsx` + `.module.css`, a "Verify this APK" section on the detail page after Ratings — the start of D-Store's transparency-over-Play-Store pitch (docs/D-STORE.md §2: checksums/permissions/source links up front). Renders `App.sha256_checksum` in a monospace, selectable `<code>` block with a copy-to-clipboard button (transient "Copied!" confirmation, `aria-live` announcement, graceful no-op if `navigator.clipboard` is unavailable — the hash is still manually selectable either way). Dummy value only — generated via `secrets.token_hex(32)` when the mock dataset was seeded (0.a.ii.zi), not a digest of any real APK bytes; becomes real once Phase 5 computes actual checksums from uploaded/mirrored APKs. `next build` passes clean; manually verified via `next start` that `/app/f-droid` renders the correct checksum, label, and copy button.
  - [x] 0.f.i.zo — Digital signature info display (dummy value) — `components/SignatureInfo.tsx` + `.module.css`, second card in "Verify this APK" alongside ChecksumDisplay. Adds `App.signing_certificate_fingerprint` to `lib/mock-data.ts` (beyond docs/D-STORE.md §7's original field list — a distinct concept from `sha256_checksum`: who signed the APK, not a hash of the file itself) with a dummy SHA-256-formatted fingerprint per app, plus a copy button matching ChecksumDisplay's UX. Signature scheme is shown as a fixed "APK Signature Scheme v1 (JAR signing)" label for every app rather than a per-app field — historically accurate for this catalog, since every app is real Fossdroid-era (2011–2016) and APK Signature Scheme v2 wasn't introduced until Android 7.0 in August 2016. `next build` passes clean; manually verified via `next start` that `/app/f-droid` renders the correct fingerprint, label, and scheme text.
- 0.f.ii — Transparency
  - [x] 0.f.ii.zi — "Why not on Play Store" disclosure UI — `components/PlayStoreDisclosure.tsx` + `.module.css`, a "Play Store Status" section after "Verify this APK." Deliberately an always-visible callout, not a collapsible `<details>` widget — docs/D-STORE.md §2 requires sideload trust signals be "first-class UI, not buried," so a click-to-expand would work against the leaf's own point. Renders `App.play_store_rejection_reason` when set (F-Droid, MaterialOS, Night Mode Enabler, Amexia, Enhancement, Greyscale have real reasons); for the `null` majority, shows an honest "nothing documented" statement naming the app rather than hiding the section entirely. `next build` passes clean; manually verified via `next start` that `/app/f-droid` shows its real reason and `/app/simply-solid` (null) shows the correct fallback text.
  - [x] 0.f.ii.zo — Permissions disclosure list (dummy data) — `components/PermissionsDisclosure.tsx` + `.module.css`, a "Permissions" section on the detail page after "Play Store Status," same always-visible-callout treatment as `PlayStoreDisclosure` (0.f.ii.zi) rather than a collapsible widget, per the same D-STORE.md §2 "first-class UI, not buried" requirement. Renders `App.permissions` (already present in `lib/mock-data.ts`) as a list of raw manifest-constant tags (e.g. `INTERNET`, `WRITE_EXTERNAL_STORAGE`); the several apps with an empty array get an explicit "requests no special permissions" statement rather than a hidden/empty section — same honest-empty-state convention `PlayStoreDisclosure` uses for a `null` rejection reason. `next build` passes clean; manually verified via `next start` that `/app/f-droid` (4 permissions) renders all four tags and `/app/awesomewallpaper` (empty array) renders the correct fallback text.
- 0.f.iii — Moderation
  - [x] 0.f.iii.zi — Anonymous "Report app" form (dummy submit — logs locally, no backend) — `components/ReportAppForm.tsx` + `.module.css`, a "Report a Problem" section on the detail page after Permissions, closing out `0.f`. Reason `<select>` (Broken download link / Malware or security concern / Inappropriate content / Copyright-DMCA issue / Other) plus an optional details `<textarea>`; submit is disabled until a reason is picked. No `ReportFlag` backend exists yet (that's the Phase 5 entity docs/D-STORE.md §7 names) — submitting only `console.log`s the payload (`appSlug`, reason, details) and flips local state to a confirmation message, same anonymous/local-state-only shape as `RateThisApp` (0.e.iii.zo). Per the note on the `2.b` track heading, the admin review queue for these reports (`2.b.iii.zo`) is real backend work and is explicitly not superseded by this leaf. `next build` passes clean; manually verified via `next start` that `/app/f-droid` renders the reason select, details field, and submit button correctly.

**0.g — Search & Category Browse** *(pulls forward `2.c`, dummy data)*
- 0.g.i — Search
  - [x] 0.g.i.zi — Instant search suggestions over the dummy dataset — `components/SearchBar.tsx` + `.module.css` (client component, replacing the plain `<input>` that used to live directly in `Header.tsx`), backed by a new `lib/search-actions.ts` server action (`searchAppsAction`) that thinly wraps the existing `searchApps` from `lib/catalog.ts` — split out the same way `lib/theme-actions.ts` is split from `lib/theme.ts`, since a `"use server"` module can only export async functions and `catalog.ts` also exports types/interfaces. Debounced 200ms (matching `catalog.ts`'s own simulated latency), capped to 6 results, dismissible via click-outside; stale responses from a superseded keystroke are dropped via a request-id ref. Still a real `<form action="/search" method="GET">` underneath, so the no-JS path to `/search?q=...` (0.g.i.zo, next) is unchanged — the dropdown is a progressive enhancement, not a replacement. The mobile order/flex-basis rule that used to live on Header's `.search` class moved to `SearchBar.module.css`'s `.wrapper` at the same 640px breakpoint, since it's still a direct child of the same `.bar` flex container. `next build` passes clean; manually verified via `next start` that `/` still renders the no-JS form (`action="/search"`, `name="q"`) correctly.
  - [x] 0.g.i.zo — Search results page — `app/search/page.tsx` + `.module.css`, the route the header form (`SearchBar`, 0.g.i.zi) has pointed `action="/search"` at as a forward reference since `0.c.i.zi`. This is the no-JS landing page: submitting the form without JS, or following any link to `/search?q=...`, always works even without the instant-suggestions dropdown. Reuses `ShelfGrid`/`AppCard` directly rather than `Shelf` (0.d.ii.zi), since `Shelf` silently renders nothing on an empty `apps` array — right for a home-page shelf, wrong here: a zero-match search needs an explicit "No apps matched" message, not a blank page. Three states: no query yet ("Type something..."), query with no matches, query with results. `next build` passes clean; manually verified via `next start` that all three states render correctly (`/search`, `/search?q=zzz...`, `/search?q=droid`).
- 0.g.ii — Category browse
  - [x] 0.g.ii.zi — Category grid page — `app/categories/page.tsx` + `.module.css` (the route Header's "Categories" nav link has pointed at as a forward reference since `0.c.i.zi`), plus `components/CategoryCard.tsx` + `.module.css` (mirrors `AppCard`'s card shape/colored-initial-tile convention; categories have no per-category color fields the way apps do, so every tile uses the shared `--color-accent` token rather than inventing colors the data doesn't have). This leaf also creates `/categories/[slug]` — the per-category apps listing each card links to (`getApps({ category: slug })`, reusing `ShelfGrid`/`AppCard` directly rather than `Shelf` since an empty category needs an explicit message, not a silently-hidden shelf) — same incremental "build the index and the page it links to" pattern `0.e.i.zi` used for the app detail page. `0.g.ii.zo` (advanced filters) extends the per-category page next. `next build` passes clean; manually verified via `next start`: `/categories` shows correct per-category counts (1 for `system`, 12 for `theming`, 0 for the rest — genuinely empty in the seed data, not a bug), `/categories/theming` renders all 12 app links, `/categories/games` (0 apps) shows the empty-state message instead of a blank grid, and `/categories/does-not-exist` 404s.
  - [x] 0.g.ii.zo — Advanced filters (license, size) — `components/CategoryFilters.tsx` + `.module.css`, a plain GET `<form>` (same no-JS-required convention as the header search form) added to the per-category page (`0.g.ii.zi`), submitting to `/categories/[slug]?license=...&maxSize=...`. `lib/catalog.ts`'s `GetAppsOptions`/`getApps` grew matching `license`/`maxSizeMb` options (a real backend would do the equivalent `WHERE` clauses, so this stays behind the same seam). The license dropdown only offers licenses actually present in that category (derived from the category's unfiltered app list, fetched separately as `allApps`) rather than every license in the whole catalog; size is offered as fixed buckets (Under 1/2/5/10 MB) since a free-form number input would ask visitors to guess against data they can't see. Three empty-state variants now: no apps in the category at all, filters active but zero matches, vs. the normal grid. `next build` passes clean (fixed one real autoprefixer warning — `align-items: end` → `flex-end` along the way); manually verified via `next start` that `/categories/theming` (12 apps) narrows correctly for `?license=GPL-3.0` (4), `?maxSize=1` (2, correct apps), and both combined (1, correct app), and that the license dropdown lists exactly the 5 licenses present in that category.
- 0.g.iii — Related content
  - [x] 0.g.iii.zi — Similar-apps rail (dummy) — added to the app detail page (`app/app/[slug]/page.tsx`) after the Report a Problem section, backed by the already-existing `getSimilarApps` (lib/catalog.ts). Reuses `Shelf` (0.d.ii.zi) directly rather than the plain `<section>`+`<h2>` wrapper every other section on this page uses — `Shelf` already renders nothing on an empty `apps` array, which is exactly right here (an app alone in its category, e.g. `system`'s lone F-Droid entry, correctly gets no rail at all rather than an empty one), so there's nothing to duplicate. `next build` passes clean; manually verified via `next start` that `/app/f-droid` (alone in `system`) shows no "Similar Apps" heading at all, and `/app/simply-solid` (one of 12 in `theming`) shows its 6 correct siblings, excluding itself.
  - [x] 0.g.iii.zo — Developer profile page (dummy) — new route `/developer/[slug]` (`app/developer/[slug]/page.tsx` + `.module.css`), closing out `0.g` entirely. `Developer` is a genuinely new concept for Phase 0 (not in the legacy `Application` entity, not in §7's field list either) — added to `lib/mock-data.ts` alongside a `developer_slug` field on `App`, plus `getDeveloperBySlug`/`getAppsByDeveloper` in `lib/catalog.ts`. Unlike most "new fields," `Developer.slug`/`name`/`profile_url` aren't invented — they're read directly off each app's real `source` GitHub/GitLab URL (e.g. `github.com/afzalmakkelamba/MaterialOS` → developer `afzalmakkelamba`), so all 13 apps map to 13 distinct real accounts; only `bio` and `joined_at` are placeholder dummy values, same treatment `signing_certificate_fingerprint` (0.f.i.zo) got. Page shows an avatar-initial header, bio, an external link to the real profile URL, and an "Apps by X" shelf (reuses `Shelf`, 0.d.ii.zi — every developer has ≥1 app by construction, so its empty-array branch never fires, but reusing it keeps this consistent with the rest of the catalog rather than a second grid implementation). Also adds a "by {developer}" credit link to `/app/[slug]`'s header (`app/app/[slug]/page.tsx`) — the only way in to the new route, same forward-reference discipline every other page here has followed. `notFound()` on an unknown slug, same convention as `/app/[slug]` and `/categories/[slug]`. `next build` passes clean; manually verified data integrity with a standalone script (all 13 apps resolve to a developer, all 13 developers resolve back to ≥1 app, e.g. `afzalmakkelamba` → `["materialos"]`).

**0.h — Geo-Regionalization Foundation** *(new — see "Scope addition" note above. The one Phase 0 track allowed a real external call; everything catalog-side still runs on dummy data.)*
- 0.h.i — IP geolocation client (ipapi.co)
  - [x] 0.h.i.zi — Global `ipapi.co` client wrapper (typed response, timeout, graceful fallback to a default region on error/429/rate-limit — never blocks rendering) — `lib/ipapi.ts`, `lookupRegion()`. Scope deliberately narrow: just the client. Hits `https://ipapi.co/json/` with a 2.5s `AbortController` timeout; treats both a non-2xx status *and* ipapi.co's own in-body `{ error: true }` shape (their free tier returns HTTP 200 with an error body for some failure modes, not only a 4xx/5xx status) as failures; any of those, a timeout, or a network/parse error all fall back the same way to a fixed `DEFAULT_REGION` (`US`) rather than throwing or returning `null` — callers never have to special-case a missing result. No caching/session-dedup (0.h.i.zo, next), no React context or cookie wiring (same leaf), no catalog coupling (`available_regions` doesn't exist yet, 0.h.ii.zi) — all explicitly out of scope here per the `0.h` heading note. `next build` passes clean; manually verified the actual fallback path (not just reasoned about it) by running `lookupRegion()` standalone via `npx tsx` — this sandbox's own network egress doesn't allowlist `ipapi.co`, so the real fetch fails immediately, and it correctly resolved `{ country_code: "US", country_name: "United States", source: "default" }` in 83ms without throwing.
  - [x] 0.h.i.zo — Region-context provider: calls the client (`0.h.i.zi`) once per visitor session (cached — cookie or edge cache, not per-request), exposes detected country/region to the component tree; no catalog coupling yet — closes out `0.h.i`. Split three ways: `middleware.ts` is the write side — the only place that can both read an incoming request's cookies and set one on the response before any page renders, so it's what makes "once per session" real: if `d-store-region` is already present it's a no-op passthrough, otherwise it calls `lookupRegion()` and sets the cookie, with no `maxAge`/`expires` (a true session cookie, not a long-lived preference like the theme cookie). `lib/region.ts` is the read side, mirroring `lib/theme.ts`'s cookie-read-in-a-server-component shape (`getRegion()`, called from `app/layout.tsx`) — decodes the JSON cookie value, falls back to the same `US` default `lib/ipapi.ts` uses if the cookie is somehow missing or malformed. `components/RegionProvider.tsx` is the component-tree side — a thin client-only React context (required because context needs a client boundary) seeded server-side via the `region` prop from layout, no client-side fetching at all, same no-flash reasoning the theme cookie already uses. `useRegion()` has no consumers yet, same as `available_regions` not existing yet — both wait for `0.h.ii`. `next build` passes clean (middleware compiles into its own bundle, 34.7 kB); manually verified end-to-end via `next start`: first request sets `Set-Cookie: d-store-region=...` with the fallback region (`ipapi.co` isn't in this sandbox's network allowlist, so this also incidentally re-proves 0.h.i.zi's fallback path under real middleware conditions, not just standalone), a second request sent with that cookie gets no `Set-Cookie` at all (cache hit, lookup genuinely skipped), and `/`, `/app/f-droid`, `/developer/fdroid` all still render 200 with the provider wrapping the tree.
- 0.h.ii — Region-aware dummy catalog scaffold
  - [x] 0.h.ii.zi — Extend `lib/mock-data.ts` `App` shape with a dummy `available_regions: string[]` field (still 100% local dummy data — no live catalog calls) — plus a new `ALL_REGIONS` const (9 ISO 3166-1 alpha-2 codes, a representative set of large markets, not all ~195 countries — this is Phase 0 scaffolding). Unlike most §7-era fields, this one has no real-world basis to seed from: FOSS Android apps are essentially never region-locked, so there's no legacy-entity or screenshot source of truth to transcribe the way `license`/`source`/etc. were. It exists purely so `0.h.ii.zo`'s region-filter helper has something to narrow against. 8 of the 13 apps carry `[...ALL_REGIONS]` (the honest default); 5 carry a deliberately narrower dummy subset (`battery-live`, `night-mode-enabler`, `awesomewallpaper`, `enhancement`, `greyscale`) so the filter has a non-trivial case to prove it actually filters, not just a no-op over an always-everywhere catalog. Every app includes `"US"` on purpose — matches `lib/ipapi.ts`'s `DEFAULT_REGION`, so a visitor whose geolocation lookup fell back to the default never gets filtered out of the whole catalog. `lib/catalog.ts` deliberately untouched this leaf — no fetch function consumes the field yet, per the leaf's own "no live catalog calls" scope; that wiring is `0.h.ii.zo`, next. `next build` passes clean — every app literal satisfying the now-required `available_regions` field is itself a type-level integrity check (a missing field on any of the 13 would have failed the build); additionally verified via a standalone script that all 13 apps have a non-empty list, every code used falls inside `ALL_REGIONS`, and all 13 include `"US"`.
  - [x] 0.h.ii.zo — Region-filter helper in the dummy data-fetch layer (`0.a.ii.zo`) that narrows `apps` by the detected region — the seam future Play-Store-style regionalized queries plug into once Supabase (`5.f.i`) lands. Closes out `0.h` and **Phase 0 in its entirety**. `lib/catalog.ts` gains `filterAppsByRegion(source, regionCode)` — a standalone exported pure filter over `App.available_regions` (`0.h.ii.zi`) — plus a `region?: string` option on `GetAppsOptions`, wired into `getApps()` alongside the existing `category`/`license`/`maxSizeMb` filters, composable with all three the same sequential-`.filter()` way `0.g.ii.zo` added `license`/`maxSizeMb`. Deliberately the *only* fetch function this leaf wires `region` into — `0.h` is a "Foundation," not a "Feature" (per its own heading note and the "Scope addition" note above): threading region through every shelf/search/similar-apps function on dummy data now would be scope creep for a leaf whose actual job is handing the real backend work (once Supabase lands) a seam to plug into, not turning on region filtering everywhere today. Nothing calls `getApps({ region: ... })` from any page yet — same "helper exists, not yet consumed" shape `getDeveloperBySlug`/`getAppsByDeveloper` had for one commit before `0.g.iii.zo` wired them up. `next build` passes clean; manually verified end-to-end via a standalone script calling the real `getApps()`: unfiltered returns all 13; `region: "IN"` correctly returns the 9 apps that include it (8 `ALL_REGIONS` apps + `battery-live`, which was given a narrower `["US","GB","IN"]` list in `0.h.ii.zi` specifically to be a non-trivial case); `region: "JP"` similarly returns the 9 that include it (8 `ALL_REGIONS` + `awesomewallpaper`); a bogus code (`"ZZ"`) correctly returns zero rather than silently matching everything; and `{ category: "theming", region: "DE" }` composes correctly with the existing category filter.

**Phase 0 — UI Revamp is complete.** Every leaf across `0.a`–`0.h` is checked off. The next leaf per docs/D-STORE.md's roadmap is `1.a.i.zo` (Phase 1 — Foundation, Data Model Migration), picking up where the Phase 0 detour began — `5.f.i.zi` (provision Supabase) is still the first *real backend* leaf and remains gated behind Phase 1–4 per the existing roadmap ordering; Phase 0 landing doesn't change that sequencing, it just means the UI this real backend will eventually sit behind is now fully scaffolded.

### Phase 1 — Foundation (data model + design system + shell)

**1.a — Data Model Migration**
- 1.a.i — Core metrics fields
  - [x] 1.a.i.zi — Add `install_count`, `avg_rating`, `rating_count` to the app entity
  - [x] 1.a.i.zo — Add `is_featured`, `is_editors_pick` flags — real data-model migration (distinct from the same-named dummy fields already in `lib/mock-data.ts`'s `App` interface, added earlier as part of Phase 0's UI scaffold, `0.a.ii.zi`). `legacy-symfony/src/Melodycode/FossdroidBundle/Entity/Application.php` gains two `boolean` properties plus `setIsFeatured`/`getIsFeatured`/`setIsEditorsPick`/`getIsEditorsPick`, placed and styled identically to `1.a.i.zi`'s `install_count`/`avg_rating`/`rating_count` addition (same PHPDoc shape, same fluent-setter-returns-`$this` convention, same boolean-getter naming as the existing `getIsPublished`, not an `isX()`-style name). `Application.orm.yml` gains matching `is_featured`/`is_editors_pick` boolean columns with `options: default: false` — same "safe against existing rows" reasoning `1.a.i.zi`'s numeric fields used `default: 0` for, rather than leaving them nullable/undefined the way `is_published` (an original-schema column, always explicitly set at insert time) is. No PHP interpreter available in this sandbox to run a real syntax check, so verified by inspection instead: brace/paren counts across the whole file are balanced pre- and post-edit, the file still ends on the class's closing brace, and the new methods are byte-for-byte structurally identical to `getIsPublished`/`setIsPublished`'s template. The YAML was validated for real, parsed with `yaml.safe_load` to confirm both new fields deserialize with the correct `type`/`options.default`. This is real backend-schema work sitting alongside a still-Phase-0-scaffolded dummy-data UI — the two `is_featured`/`is_editors_pick` concepts stay independent until Supabase (`5.f.i`) actually replaces `lib/catalog.ts`'s internals; nothing in `lib/` or `app/` was touched by this leaf.
- 1.a.ii — Trust & safety fields
  - [x] 1.a.ii.zi — Add `sha256_checksum` field — real data-model migration, same file pair and same append-before-`created_at` ordering `1.a.i.zo` used. `Application.php` gains a `string` property plus `setSha256Checksum`/`getSha256Checksum` (camelCased from the snake_case field the same way `install_count` → `InstallCount` was), styled identically to the existing `license` getter/setter template. `Application.orm.yml` gains `sha256_checksum: { type: string, nullable: true }` — `nullable: true`, not a `default:`, unlike `1.a.i.zo`'s two booleans: a checksum has no sensible zero-value default for a migration to backfill existing rows with (same reasoning the schema's original string fields like `icon`/`license`/`source` already use `nullable: true` for). Note this is the entity-level field only — the corresponding *dummy* `sha256_checksum` already exists in `lib/mock-data.ts`'s `App` interface and has since `0.a.ii.zi`, and the "Verify this APK" UI that displays it shipped as `0.f.i.zi`; this leaf is exclusively the real backend schema catching up, per the same Phase 0/Phase 1 split `1.a.i.zo` established. No PHP interpreter in this sandbox; verified by inspection (brace/paren counts balanced pre/post-edit, file still ends on the class's closing brace) and the YAML validated for real via `yaml.safe_load`.
  - [x] 1.a.ii.zo — Add `play_store_rejection_reason` field — same file pair, same append-before-`created_at` ordering (added directly after `sha256_checksum`), and same reasoning `1.a.ii.zi` used: `Application.php` gains a `string` property plus `setPlayStoreRejectionReason`/`getPlayStoreRejectionReason`, byte-for-byte structurally identical to the `setSha256Checksum`/`getSha256Checksum` template. `Application.orm.yml` gains `play_store_rejection_reason: { type: string, nullable: true }` — `nullable: true`, not a `default:`, for the same reason `sha256_checksum` used it: a rejection reason has no sensible zero-value default to backfill existing rows with. This closes out `1.a.ii` (Trust & safety fields) in full. Ties to the existing dummy "Why not on Play Store" disclosure UI (`0.f.ii.zi`) the same way `sha256_checksum` ties to the "Verify this APK" UI — the entity-level field is exclusively the real backend schema catching up; the dummy UI's data source stays `lib/mock-data.ts` until Supabase (`5.f.i`) lands. No PHP interpreter in this sandbox; verified by inspection (brace/paren counts balanced pre/post-edit — 55/55 braces, 54/54 parens — file still ends on the class's closing brace) and the YAML validated for real via `yaml.safe_load`.
- 1.a.iii — New entities
  - [x] 1.a.iii.zi — Create `Review` entity (anonymous, rate-limited) — new files, not an addition to `Application.php`: `Entity/Review.php`, `Entity/ReviewRepository.php` (custom `countByIpHashSince($ipHash, $applicationId, \DateTime $since)` finder, styled after `ApplicationRepository::findByPublished`'s query-builder pattern), and `Resources/config/doctrine/Review.orm.yml`. Fields: `id` (string PK, same style as `Application`'s), `rating` (integer), `comment` (text, nullable — reviews may be rating-only), `ip_hash` (string, nullable) and `created_at` (date) together are what make the entity "anonymous, rate-limited": no author/user reference at all (anonymous), and `ip_hash`+`created_at` are exactly what a rate-limit query needs (`ReviewRepository::countByIpHashSince` provides that query) — raw IPs are deliberately not stored, only a hash, consistent with the no-accounts privacy posture. `manyToOne` relation to `Application` via `application_id` → `id`, mirroring `Application`'s own `category` relation (`category_slug` → `slug`) in shape. Actual rate-limit *enforcement* (the concrete N-per-window rule and the controller that rejects over-limit submissions) is out of scope for this leaf — there's no API layer yet to enforce it in; this leaf only shapes the schema to make that enforcement possible later. Ties to the existing dummy "anonymous rating submission widget" UI (`0.e.iii.zo`) the same way `1.a.ii`'s fields tie to their dummy UI counterparts — this is exclusively the real backend schema; the dummy UI keeps reading from `lib/mock-data.ts` until Supabase (`5.f.i`) lands. No PHP interpreter in this sandbox; verified by inspection (brace/paren counts balanced in both new files — `Review.php` 13/13 braces, 14/14 parens; `ReviewRepository.php` 2/2 braces, 16/16 parens — both end on their class's closing brace) and the YAML validated for real via `yaml.safe_load`.
  - [ ] 1.a.iii.zo — Create `ReportFlag` entity

**1.b — Design Tokens** *(superseded — see `0.b`; leave open here, mark done only once its `0.b` counterpart ships)*
- 1.b.i — Dark theme, "Cinematic Gold"
  - [ ] 1.b.i.zi — Define color tokens (bg, surface, accent, border)
  - [ ] 1.b.i.zo — Define vignette/gradient background treatment
- 1.b.ii — Light theme, "Scientific Blue"
  - [ ] 1.b.ii.zi — Define color tokens
  - [ ] 1.b.ii.zo — Contrast-check accent variants (WCAG AA)
- 1.b.iii — Theme persistence
  - [ ] 1.b.iii.zi — Cookie-based theme storage, read server-side
  - [ ] 1.b.iii.zo — Theme toggle transition animation (no flash)

**1.c — Core Layout Shell** *(superseded — see `0.c`)*
- 1.c.i — Header
  - [ ] 1.c.i.zi — Responsive nav + search bar
  - [ ] 1.c.i.zo — Theme toggle integration
- 1.c.ii — Grid system
  - [ ] 1.c.ii.zi — Responsive shelf-grid (2→6 columns)
  - [ ] 1.c.ii.zo — Small/dense app-card component
- 1.c.iii — Footer
  - [ ] 1.c.iii.zi — Legal links (Privacy, Terms, DMCA)
  - [ ] 1.c.iii.zo — RSS link + "no account required" notice

**1.d — Home Page** *(superseded — see `0.d`)*
- 1.d.i — Hero
  - [ ] 1.d.i.zi — Cinematic hero for one featured app
  - [ ] 1.d.i.zo — Reveal animation (respects `prefers-reduced-motion`)
- 1.d.ii — Shelves
  - [ ] 1.d.ii.zi — Featured shelf
  - [ ] 1.d.ii.zo — Trending shelf (sorted by installs)
- 1.d.iii — Editorial
  - [ ] 1.d.iii.zi — Editor's Picks shelf
  - [ ] 1.d.iii.zo — Sponsored card slot (native, clearly labeled)

### Phase 2 — Discovery & Trust

**2.a — App Detail Page** *(superseded — see `0.e`)*
- 2.a.i — Media
  - [ ] 2.a.i.zi — Screenshot carousel
  - [ ] 2.a.i.zo — Lightbox viewer
- 2.a.ii — Content
  - [ ] 2.a.ii.zi — Expandable description
  - [ ] 2.a.ii.zo — "What's New" changelog block
- 2.a.iii — Ratings
  - [ ] 2.a.iii.zi — Rating stars + histogram
  - [ ] 2.a.iii.zo — Anonymous rating submission (rate-limited)

**2.b — Trust & Safety** *(display/UI leaves superseded — see `0.f`; `2.b.iii.zo` admin queue is real backend work, not superseded)*
- 2.b.i — APK verification
  - [ ] 2.b.i.zi — SHA256 checksum display
  - [ ] 2.b.i.zo — Digital signature info display
- 2.b.ii — Transparency
  - [ ] 2.b.ii.zi — "Why not on Play Store" disclosure UI
  - [ ] 2.b.ii.zo — Permissions disclosure list
- 2.b.iii — Moderation
  - [ ] 2.b.iii.zi — Anonymous "Report app" form
  - [ ] 2.b.iii.zo — Report review queue (admin)

**2.c — Search & Category** *(superseded — see `0.g`)*
- 2.c.i — Search
  - [ ] 2.c.i.zi — Instant search suggestions
  - [ ] 2.c.i.zo — Search results page
- 2.c.ii — Category browse
  - [ ] 2.c.ii.zi — Category grid page
  - [ ] 2.c.ii.zo — Advanced filters (license, size)
- 2.c.iii — Related content
  - [ ] 2.c.iii.zi — Similar-apps rail
  - [ ] 2.c.iii.zo — Developer profile page

**2.d — Legal & Compliance**
- 2.d.i — Policies
  - [ ] 2.d.i.zi — Privacy Policy page
  - [ ] 2.d.i.zo — Terms of Service page
- 2.d.ii — Consent
  - [ ] 2.d.ii.zi — Cookie/ad consent banner
  - [ ] 2.d.ii.zo — DMCA/takedown process page
- 2.d.iii — SEO
  - [ ] 2.d.iii.zi — Per-app `sitemap.xml`
  - [ ] 2.d.iii.zo — `schema.org` `SoftwareApplication` structured data

### Phase 3 — Motion, Metrics & Charts

**3.a — Animation System**
- 3.a.i — Scroll reveal
  - [ ] 3.a.i.zi — Intersection-observer reveal utility
  - [ ] 3.a.i.zo — Apply reveal to shelves/hero
- 3.a.ii — Micro-interactions
  - [ ] 3.a.ii.zi — Button/card hover & press states
  - [ ] 3.a.ii.zo — Install-button progress animation
- 3.a.iii — Loading states
  - [ ] 3.a.iii.zi — Skeleton shimmer components
  - [ ] 3.a.iii.zo — Empty/error/404 state designs

**3.b — Metrics Pipeline**
*(Per the architecture pivot in Section 0: GitHub Releases already exposes per-asset download counts, so install/trending numbers should be sourced from the GitHub API into Supabase rather than built as custom increment endpoints. Re-scope these two leaves against that before starting them.)*
- 3.b.i — Counters
  - [ ] 3.b.i.zi — Install-count increment endpoint
  - [ ] 3.b.i.zo — View-count increment endpoint
- 3.b.ii — Aggregation
  - [ ] 3.b.ii.zi — Denormalized `avg_rating`/`review_count` job
  - [ ] 3.b.ii.zo — Daily materialized Trending cache
- 3.b.iii — Charts
  - [ ] 3.b.iii.zi — Top Free chart page
  - [ ] 3.b.iii.zo — New & Updated chart page

**3.c — Admin/Editorial Tools**
- 3.c.i — Featuring
  - [ ] 3.c.i.zi — Admin toggle for `is_featured`/`is_editors_pick`
  - [ ] 3.c.i.zo — Sponsored-slot scheduling tool
- 3.c.ii — Analytics
  - [ ] 3.c.ii.zi — Traffic dashboard
  - [ ] 3.c.ii.zo — Top-searches dashboard
- 3.c.iii — Moderation
  - [ ] 3.c.iii.zi — Report-flag queue UI
  - [ ] 3.c.iii.zo — Review moderation queue UI

**3.d — Accessibility & Performance**
- 3.d.i — Accessibility
  - [ ] 3.d.i.zi — WCAG 2.1 AA contrast audit (both themes)
  - [ ] 3.d.i.zo — Keyboard nav + focus-visible audit
- 3.d.ii — Performance
  - [ ] 3.d.ii.zi — Image CDN + responsive `srcset`
  - [ ] 3.d.ii.zo — Lighthouse LCP < 2.5s budget pass
- 3.d.iii — Reduced motion
  - [ ] 3.d.iii.zi — `prefers-reduced-motion` audit sitewide
  - [ ] 3.d.iii.zo — Static fallback states for all animations

### Phase 4 — Growth & Monetization

**4.a — Ads Infrastructure**
- 4.a.i — Placement
  - [ ] 4.a.i.zi — Home banner ad slot
  - [ ] 4.a.i.zo — Native inline Sponsored card in shelves
- 4.a.ii — Resilience
  - [ ] 4.a.ii.zi — Ad-block detection fallback
  - [ ] 4.a.ii.zo — Frequency-capping logic
- 4.a.iii — Expansion
  - [ ] 4.a.iii.zi — Detail-page sidebar ad unit (desktop)
  - [ ] 4.a.iii.zo — Seasonal sponsored category takeover

**4.b — Progressive Web App**
- 4.b.i — Installability
  - [ ] 4.b.i.zi — Web app manifest
  - [ ] 4.b.i.zo — Service worker offline shell
- 4.b.ii — Icons/splash
  - [ ] 4.b.ii.zi — Theme-aware app icons
  - [ ] 4.b.ii.zo — Splash screens per theme

**4.c — Growth Loops**
- 4.c.i — Syndication
  - [ ] 4.c.i.zi — RSS/Atom feed for new & updated apps
  - [ ] 4.c.i.zo — Public stats footer widget
- 4.c.ii — Sharing
  - [ ] 4.c.ii.zi — Share button + QR code for direct install
  - [ ] 4.c.ii.zo — Editorial collections (e.g. "Privacy Tools")

**4.d — Local (non-account) Personalization**
- 4.d.i — Favorites
  - [ ] 4.d.i.zi — IndexedDB-based local favorites
  - [ ] 4.d.i.zo — "Saved apps" view (no login)
- 4.d.ii — Recommendations
  - [ ] 4.d.ii.zi — Category-affinity "For You" row
  - [ ] 4.d.ii.zo — Personalization tuning from local history

### Phase 5 — Infrastructure & Distribution

**5.a — CI/CD Pipeline (GitHub Actions — build/workflow only, no storage role)**
- 5.a.i — Build & tag
  - [ ] 5.a.i.zi — APK ingest workflow, triggered on new release commit
  - [ ] 5.a.i.zo — Semantic version tagging automation
- 5.a.ii — Build artifacts
  - [ ] 5.a.ii.zi — Generate changelog per version; artifacts stay attached to the workflow run (build → sign → split → checksum → Telegram upload all happen as steps in one CI job) — no GitHub Release object is created
  - [ ] 5.a.ii.zo — Auto-generate SHA256 checksum, handed off within the same workflow run to the Telegram upload step (5.b.ii.zi)
- 5.a.iii — Catalog sync
  - [ ] 5.a.iii.zi — Final CI workflow step: once the Telegram upload step confirms success, call the D-Store catalog/DB update directly from the workflow (not a separate webhook listening on Telegram — Telegram's only job is storage, everything else runs in GitHub Actions)
  - [ ] 5.a.iii.zo — Nightly reconciliation job (catalog vs. Telegram drive drift check)

**5.b — Storage & Delivery Backend**
- 5.b.i — Primary storage (Telegram S3-compatible drive)
  - [ ] 5.b.i.zi — Document/confirm the CI integration point for the existing Telegram S3-compatible drive — it's already deployed and has been continuously active, so this is verification and wiring, not a fresh deploy
  - [ ] 5.b.i.zo — Retention/cleanup policy on the Telegram drive
- 5.b.ii — Storage handoff step (within the GitHub Actions workflow)
  - [ ] 5.b.ii.zi — CI step: after build/sign/split in the same workflow run, push artifacts to the Telegram S3 drive — Telegram receives and stores the finished assets, it doesn't run any pipeline logic itself
  - [ ] 5.b.ii.zo — CI step: verify the Telegram drive copy's checksum matches before the workflow reports success (retry within the same run on mismatch)
- 5.b.iii — Edge delivery
  - [ ] 5.b.iii.zi — Cloudflare Worker download endpoint fronting the Telegram S3 drive as sole backend
  - [ ] 5.b.iii.zo — Retry/backoff handling against the Telegram drive (no second storage backend to fail over to, since GitHub no longer holds binaries)

**5.c — Update & Version History**
- 5.c.i — Update mechanism
  - [ ] 5.c.i.zi — Companion "D-Store Updater" app spec/scaffold
  - [ ] 5.c.i.zo — Web Push subscription for saved-app updates (ties to 4.d local favorites)
- 5.c.ii — Version history
  - [ ] 5.c.ii.zi — "Version history" tab on detail page
  - [ ] 5.c.ii.zo — Direct download links for older versions (from Telegram drive version history)
- 5.c.iii — Rollback & advisories
  - [ ] 5.c.iii.zi — Rollback: install-older-version flow
  - [ ] 5.c.iii.zo — Deprecation/security-advisory banner for pulled/flagged versions

**5.d — Security, Abuse Prevention & Governance**
- 5.d.i — Automated scanning
  - [ ] 5.d.i.zi — Static malware-signature scan step in CI before publish
  - [ ] 5.d.i.zo — Permission-diff alert between app versions
- 5.d.ii — Anti-abuse throttling
  - [ ] 5.d.ii.zi — Rate-limit/fingerprint-throttle install & view counters
  - [ ] 5.d.ii.zo — Rate-limit/fingerprint-throttle ratings & reports
- 5.d.iii — Quality & governance docs
  - [ ] 5.d.iii.zi — Baseline test suite (unit + e2e smoke test for browse/download/rate)
  - [ ] 5.d.iii.zo — Catalog acceptance/moderation policy + patch ledger (`CHANGELOG.md`)

**5.e — Split & Compressed Delivery (OTA chunking)**
- 5.e.i — Build-time splitting
  - [ ] 5.e.i.zi — Generate split APKs in CI (base + ABI/density/language config splits) so users only download what their device needs
  - [ ] 5.e.i.zo — Compress each split beyond the APK's own compression before upload
- 5.e.ii — Chunked transfer
  - [ ] 5.e.ii.zi — Chunk each split into ≤200MB segments for over-the-air delivery
  - [ ] 5.e.ii.zo — Resumable chunk download (retry the failed chunk only, not the whole file, on a dropped connection)
- 5.e.iii — Client-side reassembly & install
  - [ ] 5.e.iii.zi — D-Store Updater: reassemble chunks and install the split-APK set (builds on 5.c.i)
  - [ ] 5.e.iii.zo — Per-chunk and per-split checksum verification before install

**5.f — Catalog Database & Platform Risk**
- 5.f.i — Catalog database
  - [ ] 5.f.i.zi — Provision Supabase (Postgres) as the metadata store — app info, ratings, counters, developer/agreement status
  - [ ] 5.f.i.zo — Migrate schema from existing Symfony/Doctrine `Application`/`Category` entities into Supabase
- 5.f.ii — Platform risk documentation
  - [ ] 5.f.ii.zi — Document GitHub Actions/API quota risk (CI/workflow usage only — GitHub no longer serves download/distribution traffic)
  - [ ] 5.f.ii.zo — Document Telegram Bot API ToS/rate-limit risk at CDN-level traffic (now the primary distribution channel, not a mirror)
- 5.f.iii — Quota monitoring
  - [ ] 5.f.iii.zi — GitHub API/Actions rate-limit monitoring/alerting (CI/workflow usage only)
  - [ ] 5.f.iii.zo — Telegram & Workers request-quota monitoring/alerting (primary traffic path)

**5.g — Developer Console Integration (cross-repo contract)**
*This repo never submits, uploads, or authenticates developers — it only reads what the separate Console writes to Supabase. These leaves are about the read-side contract, not building the Console itself.*
- 5.g.i — Metadata read contract
  - [ ] 5.g.i.zi — Read-only Supabase client in this repo (no write access, no login, matches the no-account scope decision)
  - [ ] 5.g.i.zo — Define the shared schema contract (field names/types) this repo expects from Console-written rows
- 5.g.ii — AAB → APK compile pipeline (GitHub Actions side)
  - [ ] 5.g.ii.zi — `bundletool`-based AAB→signed-APK/split compilation step, triggered by a Console submission event
  - [ ] 5.g.ii.zo — Publish the compiled APK to the Telegram S3-compatible drive as the distributed copy; GitHub Releases is not used for binary distribution, and the raw AAB never leaves the Console/build environment
- 5.g.iii — Developer trust signals
  - [ ] 5.g.iii.zi — "Verified developer" badge on the app detail page, sourced from the Console's agreement-signing status in Supabase
  - [ ] 5.g.iii.zo — Footer link to the Console site as the submission entry point (no submission UI lives in this repo)

---

## 3. Standing Handoff Process (mandatory, every session)

This is the same process used to hand off the D-Store documentation itself — it is now the fixed rule for every session, no exceptions.

**Key location — cache files:** the storefront reads catalog/asset data from local cache files only, never live per-request calls to Telegram or Supabase — this keeps the app populated and responsive even if either upstream is briefly unreachable. Cached/downloaded files live at **`storage/downloads`**. Any leaf that touches caching, downloads, or catalog population must read from and write to this location; note it explicitly in the commit body when a leaf adds or changes what's cached there.

0. **Check upstream first, before doing anything else:** `git fetch origin` and compare against `origin/master`. If origin has moved since the local clone/session was last synced (earlier patches already applied and pushed, for instance), rebase local work onto the current `origin/master` (`git rebase origin/master`) before starting the leaf and before generating any patch. A patch built against a stale base will fail to apply with `git am` even when the content it wants is logically identical to what's already there — this step is what prevents that.
1. **Do the one assigned leaf task** (Section 1 — nothing more).
2. **Update this file**: flip the completed leaf's `[ ]` to `[x]`, and move the "Current position" line (Section 0) to the next open leaf in path order (`zi` before `zo`; within a milestone before moving to the next `i/ii/iii`; within a track before the next `a/b/c/d`; within a phase before the next `1/2/3/4`).
3. **Commit** the code change and the `HANDOVER.md` update **together**, in one commit, with a message that starts with the leaf path:
   ```
   git add -A
   git commit -m "1.a.i.zi: add install_count, avg_rating, rating_count fields"
   ```
4. **Generate the patch**, based on the current `origin/master` (from step 0), for that single commit:
   ```
   git format-patch -1 HEAD -o patches/
   ```
5. **Hand the patch file to the user** — never push directly unless explicitly told to. The patch is the deliverable that closes the session. **Always hand off exactly one patch file, never more than one.** If a handoff spans several commits (e.g. a multi-commit resequencing session, or several small fixes batched together), combine them into a single file with `git format-patch origin/master --stdout > patches/000X-<description>.patch` — this produces one mbox-style file containing all the commits since the real upstream state, in order, which `git am` applies in one shot. Do not hand off several separate `.patch` files for one handoff.
6. The next session applies it with:
   ```
   cd ~/D-Store
   git am ~/storage/downloads/000X-<leaf-path>-<description>.patch
   git push origin master
   ```

If a leaf can't be finished in one session, do not commit partial work as done — mark it `[~]`, commit what exists with a `WIP:` prefix, note in the commit body exactly what's left, and still hand off a patch. The next session resumes that same leaf before touching "Current position."

---

*This file is the single source of truth for what to work on. If it disagrees with any other document, HANDOVER.md wins for sequencing; D-STORE.md wins for feature/design specification.*
