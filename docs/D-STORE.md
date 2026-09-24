# D-Store — Product & Architecture Documentation
*Formerly "Fossdroid-Core modernization framework" — consolidated, renamed, documentation-only.*

---

## 0. What D-Store Is

D-Store is a **direct-download Android app store**, built by upgrading the open-source Fossdroid-Core codebase. It exists specifically as the distribution channel for apps that **Play Store policy won't accept**, complementing an existing Play Store developer console used for compliant apps. Everything below assumes:

- Android-only — no iOS, no cross-platform ambiguity in the UI or data model.
- No user accounts — browsing, rating, and downloading all work anonymously.
- Sideloaded APK distribution is the delivery mechanism, not an app-store-mediated install.

This last point matters more than it looks: it changes what "trust" has to be built *by the store itself* rather than inherited from Play Store's review process (see Section 5, Trust & Safety).

---

## 1. Baseline Audit — What the Old Codebase Gives Us

| Layer | State in Fossdroid-Core (as cloned) | Verdict |
|---|---|---|
| Backend | Symfony 2.8, PHP ≥5.6, Doctrine ORM | End-of-life, unsupported since 2019 — full rebuild recommended over in-place upgrade |
| Data model | `Application` entity: name, summary, description, icon, apk, version, license, category | No downloads, ratings, reviews, screenshots, changelog, or featured flags |
| Frontend | Twig templates, static CSS | No component system, no theming, no animation layer |
| Discovery | Category browse + basic search | No personalization, no trending/featured logic |
| Monetization | None | No ad infrastructure |
| Metrics | None (explicitly excluded — README says "popularity data" was dropped) | No install counts, no charts |

**Decision: rebuild the frontend in Next.js (latest, App Router)**, keep the underlying app catalog data (names, categories, source links, licenses) as the seed dataset, and replace everything else.

---

## 2. Benchmark — What Play Store Does That D-Store Should Match or Beat

Tabbed navigation, a personalized home feed, Top Charts per category, Editor's Choice collections, a New & Updated shelf, screenshot/video carousels on detail pages, expandable descriptions, a "What's New" changelog, a ratings histogram plus written reviews, permissions/data-safety disclosure, a related-apps rail, developer profile pages, an install button with live progress, and native "Sponsored" cards woven into listings rather than interstitials.

D-Store's edge over Play Store, given the context: **it can be more transparent about the app itself** — checksums, permissions, and source links up front — since that's exactly the trust Play Store's walled review process normally provides and sideloading skips.

---

## 3. Locked-In Scope Decisions

| Decision | What it rules in/out |
|---|---|
| Stack: Next.js (latest, App Router) | SSR/SSG for SEO, no separate PHP frontend, React Server Components |
| Mobile-responsive first | Grid reflows 6 → 3 → 2 columns; touch targets ≥44px |
| Small, dense cards | Play-Store-density grid, not oversized promo tiles everywhere |
| Android-only listings | No platform filter UI needed anywhere |
| No login/accounts | No saved server-side wishlists, no authored-identity reviews, no per-user push |
| Sideload-first distribution | Trust signals (checksum, permissions, source link) must be first-class UI, not buried |

---

## 4. Complete Feature Framework

Legend: ✅ Must-have for launch · 🟡 Phase 2 · 🔶 Stretch/differentiator

### A. Core Store & Discovery

| Feature | Priority |
|---|---|
| Tabbed home (Featured / Categories / Search) | ✅ |
| Cinematic hero — one featured app, one deliberate visual moment | ✅ |
| "Editor's Picks" curated collection | ✅ |
| "Trending Now" shelf (by install count) | ✅ |
| "New & Updated" shelf | ✅ |
| Category grid | ✅ |
| Similar/related apps rail on detail page | ✅ |
| Global search with instant suggestions | ✅ |
| Personalized "For You" row | 🟡 |
| Advanced filters (license, category, size) | 🟡 |
| Editorial collections (e.g. "Privacy Tools") | 🔶 |

### B. App Detail Page

| Feature | Priority |
|---|---|
| Screenshot carousel (swipeable, lightbox) | ✅ |
| Expandable "Read more" description | ✅ |
| "What's New" changelog block | ✅ |
| Rating stars + histogram | ✅ |
| Install/Download button with progress state | ✅ |
| License & source-code badges | ✅ |
| **APK checksum (SHA256) displayed inline** | ✅ |
| **"Why this isn't on Play Store" note field** (policy reason, shown transparently) | ✅ |
| Permissions disclosure list | ✅ |
| Written reviews with sort | 🟡 |
| Share + QR code for direct install | 🔶 |

### C. Visual Design System — Dual Theming

| Feature | Priority |
|---|---|
| **Dark — "Cinematic Gold"**: near-black base, warm gold accent, subtle vignette | ✅ |
| **Light — "Scientific Blue"**: crisp white/gray base, cobalt accent, clinical precision | ✅ |
| Glassmorphism — used once deliberately (header, hero, modals), not on every card | ✅ |
| System-preference auto-detect + manual toggle, persisted via cookie (no login → no account-level preference storage) | ✅ |
| Smooth theme-transition animation, no flash | ✅ |
| Scroll-triggered reveal, respecting `prefers-reduced-motion` | ✅ |
| Skeleton loading states | ✅ |

### D. Monetization / Ads

| Feature | Priority |
|---|---|
| Native inline "Sponsored" cards, styled like organic cards, clearly labeled | ✅ |
| Home banner ad slot | ✅ |
| Ad-block detection fallback (don't degrade UX if blocked) | ✅ |
| Detail-page sidebar ad unit (desktop) | 🟡 |
| Seasonal sponsored category takeover | 🔶 |

### E. Metrics & Growth

| Feature | Priority |
|---|---|
| Install/download counters per app | ✅ |
| View counters (powers Trending) | ✅ |
| Rating aggregate + review count | ✅ |
| Charts: Top Free / Trending / New | ✅ |
| Public stats footer widget (total apps, downloads) | 🟡 |
| Admin analytics panel | 🟡 |

### F. Trust & Safety — the section sideloading makes non-optional

| Feature | Priority | Why |
|---|---|---|
| SHA256 checksum on every APK | ✅ | Replaces Play Store's review-process trust |
| Digital signature info displayed | ✅ | Lets technical users verify authenticity themselves |
| Explicit "why not on Play Store" disclosure per app | ✅ | Builds trust through transparency rather than hiding it |
| Anonymous "Report app" flow (broken link, malware concern) | ✅ | No accounts means lightweight, not review-thread moderation |
| Legal pages: Privacy Policy, Terms, DMCA/takedown process | ✅ | Required once ads + user flags exist |
| Cookie/ad consent banner | ✅ | Required once ad infrastructure goes live |

### G. Performance & Platform

| Feature | Priority |
|---|---|
| Progressive Web App (installable, offline shell for the *store itself*) | ✅ |
| Image CDN + lazy loading + responsive images | ✅ |
| Lighthouse performance budget (LCP <2.5s) | ✅ |
| Accessibility (WCAG 2.1 AA, keyboard nav, both themes contrast-checked) | ✅ |
| SEO: per-app sitemap.xml, structured data (schema.org SoftwareApplication) | ✅ |
| RSS/Atom feed for new & updated apps (replaces per-user push, since no accounts) | ✅ |

---

## 5. Data Model Additions Needed

The existing `Application` entity (name, summary, description, icon, apk, version, license, category) needs these fields before any of Section 4 can render:

`screenshots[]` · `changelog` · `install_count` · `avg_rating` · `rating_count` · `is_featured` · `is_editors_pick` · `min_android_version` · `size_mb` · `sha256_checksum` · `play_store_rejection_reason` · `permissions[]`

New entities: `Review` (anonymous, rate-limited), `ReportFlag` (anonymous app reports).

---

## 6. Suggested Build Order

1. Data model migration — add the fields above to the existing app catalog
2. Design tokens — both theme palettes as CSS variables, cookie-based persistence
3. Core layout — home shelves, category grid, detail page
4. Trust & Safety layer — checksum display, rejection-reason field, report flow (non-negotiable given sideload distribution)
5. Metrics pipeline — real install/view counters
6. Ads — native card slots
7. PWA + performance + SEO pass

---

## 7. Infrastructure & Distribution

| Component | Choice |
|---|---|
| Build & signing | **Not this repo.** The Developer Console (Zealot) compiles the AAB, signs with the organisation key, and splits/checksums. This repo has no compile pipeline |
| APK storage | **Held by the Console (Zealot)** in its own release storage. This repo stores no binaries |
| Edge/CDN | Open — whether a CDN/edge fronts the Console's download route is undecided |
| Catalog source | The **Console's signed catalog index** — listing text, asset references with SHA-256, versions, the pointer to the Console-held APK, publisher and verified-developer flag. Read-only here, cached locally |
| Store-owned data | **Supabase (Postgres)** — ratings, reviews, install/view counters, abuse reports: what users generate on the store. Never binaries, and no longer the catalog |
| Delivery model | Produced by the Console: split APKs (base + ABI/density/language config splits), further compressed, chunked into ≤200MB segments for OTA transfer — no single user-facing download exceeds ~200MB even for larger apps |

This repo needs no blob storage of its own: binaries live with the Console (Zealot), and this repo only holds catalog metadata (Supabase, above) plus the link to the download. The earlier Telegram-drive and Cloudflare-Worker storage design is superseded; see "Resolved — binary ownership" in `HANDOVER.md`.

*One item mentioned alongside this setup is not yet included pending clarification: "C2" — unclear meaning, and commonly refers to command-and-control infrastructure for remotely controlling other devices, which would not be something this documentation can include. Will be added once clarified.*

---

## 8. System Boundary — This Repo Is the Storefront, Not the Console

D-Store is two systems, not one:

| System | What it does | Repo |
|---|---|---|
| **Developer Console** | Where developers submit their `.aab` (Android App Bundle), sign a copyright/distribution agreement (same function as Play Store's developer agreement), and manage listings. It also compiles, signs and stores the resulting APK | **Separate site — not this repo** |
| **D-Store (this repo)** | The public, no-login, front-facing storefront (Play Store features, web-based) — browse, search, view app details, and a download button that links to the Console-held APK | **This repo** |

**This repo has no submission UI, no AAB upload, no developer authentication, and no agreement-signing flow.** Its only relationship to the Console is reading the metadata the Console's pipeline writes to Supabase, and linking out to the Console site for anyone who wants to submit an app.

### The compile pipeline (bridges the two systems)

1. Developer uploads a signed `.aab` to the Console and accepts the distribution agreement.
2. The Console runs **bundletool** in its own pipeline to generate a signed, distributable APK (or split-APK set) from the AAB, signed with the organisation key — the same approach Play Store's own Play App Signing uses.
3. The **compiled APK is stored by the Console** — a derived copy, not the original AAB. The raw AAB never leaves the Console/build environment and is never publicly exposed.
4. The Console publishes a **signed, versioned catalog index** (app info, versions, developer/agreement status as a verified flag, and the pointer to the compiled APK), with a SHA-256 for every referenced file.
5. This repo reads that index, verifies it, and links downloads to the Console-held APK — it never sees or handles the AAB, never stores the APK, and never writes catalog data.

**Reference model.** This split mirrors Google Play: Play Console is where developers work (identity, builds, signing, review, release management, listing, analytics, replying to reviews) and the Play Store app only displays and serves, while users' reviews and ratings are the store's own data that the console reads. F-Droid supplies the catalog mechanism: clients read only a signed index and verify every file by hash.

This is the same posture Play Store takes with app bundles: what end users receive is a platform-generated artifact derived from the developer's upload, not the raw upload itself.

---

*Documentation only, as requested — no code has been generated for D-Store. Next step is your call: I can go deeper on any single section above (e.g. write out the full data schema, or the Trust & Safety UX copy) as more documentation.*
