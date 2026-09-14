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

### Current position

> **Next leaf to work: `1.a.i.zi`**
> *(Update this line every session — see Section 3, step 4.)*

---

## 1. The Rule, stated plainly

**Every session does exactly one leaf task. No more, no less.**

- Do not start a second leaf even if time/context remains — end the session, hand off, let the next session pick up `zo` or the next milestone.
- Do not leave a leaf half-done. If a leaf turns out to be bigger than one session, stop and split it into a new sub-leaf pair before writing any code, then hand off the split itself as the session's one task.
- Always re-read "Current position" before doing anything else.

---

## 2. Full Task Hierarchy

### Phase 1 — Foundation (data model + design system + shell)

**1.a — Data Model Migration**
- 1.a.i — Core metrics fields
  - [ ] 1.a.i.zi — Add `install_count`, `avg_rating`, `rating_count` to the app entity
  - [ ] 1.a.i.zo — Add `is_featured`, `is_editors_pick` flags
- 1.a.ii — Trust & safety fields
  - [ ] 1.a.ii.zi — Add `sha256_checksum` field
  - [ ] 1.a.ii.zo — Add `play_store_rejection_reason` field
- 1.a.iii — New entities
  - [ ] 1.a.iii.zi — Create `Review` entity (anonymous, rate-limited)
  - [ ] 1.a.iii.zo — Create `ReportFlag` entity

**1.b — Design Tokens**
- 1.b.i — Dark theme, "Cinematic Gold"
  - [ ] 1.b.i.zi — Define color tokens (bg, surface, accent, border)
  - [ ] 1.b.i.zo — Define vignette/gradient background treatment
- 1.b.ii — Light theme, "Scientific Blue"
  - [ ] 1.b.ii.zi — Define color tokens
  - [ ] 1.b.ii.zo — Contrast-check accent variants (WCAG AA)
- 1.b.iii — Theme persistence
  - [ ] 1.b.iii.zi — Cookie-based theme storage, read server-side
  - [ ] 1.b.iii.zo — Theme toggle transition animation (no flash)

**1.c — Core Layout Shell**
- 1.c.i — Header
  - [ ] 1.c.i.zi — Responsive nav + search bar
  - [ ] 1.c.i.zo — Theme toggle integration
- 1.c.ii — Grid system
  - [ ] 1.c.ii.zi — Responsive shelf-grid (2→6 columns)
  - [ ] 1.c.ii.zo — Small/dense app-card component
- 1.c.iii — Footer
  - [ ] 1.c.iii.zi — Legal links (Privacy, Terms, DMCA)
  - [ ] 1.c.iii.zo — RSS link + "no account required" notice

**1.d — Home Page**
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

**2.a — App Detail Page**
- 2.a.i — Media
  - [ ] 2.a.i.zi — Screenshot carousel
  - [ ] 2.a.i.zo — Lightbox viewer
- 2.a.ii — Content
  - [ ] 2.a.ii.zi — Expandable description
  - [ ] 2.a.ii.zo — "What's New" changelog block
- 2.a.iii — Ratings
  - [ ] 2.a.iii.zi — Rating stars + histogram
  - [ ] 2.a.iii.zo — Anonymous rating submission (rate-limited)

**2.b — Trust & Safety**
- 2.b.i — APK verification
  - [ ] 2.b.i.zi — SHA256 checksum display
  - [ ] 2.b.i.zo — Digital signature info display
- 2.b.ii — Transparency
  - [ ] 2.b.ii.zi — "Why not on Play Store" disclosure UI
  - [ ] 2.b.ii.zo — Permissions disclosure list
- 2.b.iii — Moderation
  - [ ] 2.b.iii.zi — Anonymous "Report app" form
  - [ ] 2.b.iii.zo — Report review queue (admin)

**2.c — Search & Category**
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

**5.a — CI/CD Pipeline (GitHub Actions)**
- 5.a.i — Build & tag
  - [ ] 5.a.i.zi — APK ingest workflow, triggered on new release commit
  - [ ] 5.a.i.zo — Semantic version tagging automation
- 5.a.ii — Release publishing
  - [ ] 5.a.ii.zi — Auto-create GitHub Release with changelog per version
  - [ ] 5.a.ii.zo — Auto-generate & attach SHA256 checksum to release assets
- 5.a.iii — Catalog sync
  - [ ] 5.a.iii.zi — Webhook: GitHub Release published → update D-Store catalog/DB
  - [ ] 5.a.iii.zo — Nightly reconciliation job (catalog vs. GitHub Releases drift check)

**5.b — Storage & Mirrors**
- 5.b.i — Primary storage
  - [ ] 5.b.i.zi — GitHub Releases as primary APK storage
  - [ ] 5.b.i.zo — Release asset retention/cleanup policy
- 5.b.ii — Telegram S3-compatible mirror
  - [ ] 5.b.ii.zi — Deploy S3-compatible Telegram Drive backend
  - [ ] 5.b.ii.zo — Mirror sync job: GitHub Release → Telegram S3 backend
- 5.b.iii — Edge delivery
  - [ ] 5.b.iii.zi — Cloudflare Worker unified download endpoint (fronts both mirrors)
  - [ ] 5.b.iii.zo — Failover logic (serve from mirror if primary unavailable)

**5.c — Update & Version History**
- 5.c.i — Update mechanism
  - [ ] 5.c.i.zi — Companion "D-Store Updater" app spec/scaffold
  - [ ] 5.c.i.zo — Web Push subscription for saved-app updates (ties to 4.d local favorites)
- 5.c.ii — Version history
  - [ ] 5.c.ii.zi — "Version history" tab on detail page
  - [ ] 5.c.ii.zo — Direct download links for older versions (from GitHub Releases history)
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
  - [ ] 5.f.i.zi — Choose and provision the catalog database (Cloudflare D1 pairs naturally with Workers)
  - [ ] 5.f.i.zo — Migrate schema from the existing Symfony/Doctrine `Application`/`Category` entities into D1
- 5.f.ii — Platform risk documentation
  - [ ] 5.f.ii.zi — Document GitHub Releases ToS/abuse-policy risk at CDN-level traffic
  - [ ] 5.f.ii.zo — Document Telegram Bot API ToS/rate-limit risk at CDN-level traffic
- 5.f.iii — Quota monitoring
  - [ ] 5.f.iii.zi — GitHub API rate-limit monitoring/alerting
  - [ ] 5.f.iii.zo — Telegram & Workers request-quota monitoring/alerting

---

## 3. Standing Handoff Process (mandatory, every session)

This is the same process used to hand off the D-Store documentation itself — it is now the fixed rule for every session, no exceptions.

1. **Do the one assigned leaf task** (Section 1 — nothing more).
2. **Update this file**: flip the completed leaf's `[ ]` to `[x]`, and move the "Current position" line (Section 0) to the next open leaf in path order (`zi` before `zo`; within a milestone before moving to the next `i/ii/iii`; within a track before the next `a/b/c/d`; within a phase before the next `1/2/3/4`).
3. **Commit** the code change and the `HANDOVER.md` update **together**, in one commit, with a message that starts with the leaf path:
   ```
   git add -A
   git commit -m "1.a.i.zi: add install_count, avg_rating, rating_count fields"
   ```
4. **Generate the patch** for that single commit:
   ```
   git format-patch -1 HEAD -o patches/
   ```
5. **Hand the patch file to the user** — never push directly unless explicitly told to. The patch is the deliverable that closes the session.
6. The next session applies it with:
   ```
   git am patches/000X-<leaf-path>-<description>.patch
   git push origin master
   ```

If a leaf can't be finished in one session, do not commit partial work as done — mark it `[~]`, commit what exists with a `WIP:` prefix, note in the commit body exactly what's left, and still hand off a patch. The next session resumes that same leaf before touching "Current position."

---

*This file is the single source of truth for what to work on. If it disagrees with any other document, HANDOVER.md wins for sequencing; D-STORE.md wins for feature/design specification.*
