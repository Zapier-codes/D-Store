# Play Store / Play Console parity — the web storefront half

The mirrored half of Storeapp's `docs/PLAY-PARITY.md`. Same table, with each row's
**web** status: what this storefront already ships, what the port from Storeapp adds,
and what is honestly out of scope for a multi-source open-source catalogue. Read the
two files together — Storeapp's copy carries the porting notes for the client, this
one for the web.

Status legend

| Mark | Meaning |
| --- | --- |
| **have** | Shipped here. |
| **derived** | Play shows a curated field; we show the honest equivalent computed from data we hold. |
| **port** | Buildable later from Storeapp's `PlayModels.kt` / `PlaySurfaces.kt`; a note says how. |
| **n/a** | No honest equivalent for this catalogue. Not built on purpose. |

---

## 1. Play Store — consumer capabilities

| Play capability | Web status | Where / note |
| --- | --- | --- |
| Detail hero (icon, name, developer, install CTA) | have | `components/Hero.tsx`, `InstallCard.tsx`, `StickyInstallBar.tsx`. |
| Screenshots / gallery | have | details page gallery. |
| Rating line — stars + count | have | `components/RatingSummary.tsx`, `RatingBoard.tsx` (`avg_rating`/`rating_count` off the index). |
| Ratings & reviews | have | `components/ReviewsList.tsx` — carried-over comments plus this store's own anonymous star submissions, merged by date. |
| Developer replies on reviews | port | Storeapp models `ReviewItem.devReply` and renders it; the web port reads the same field. Needs a backend column first (see §3). |
| Install / download | have | `InstallButton.tsx` (`5.g.ii.zi`), resolving straight to Zealot's served URL. |
| **Per-app auto-update** toggle | port | Client-only concept: the web storefront has no background updater, so there is nothing for the toggle to switch on the web. Recorded here so the port is deliberately *not* attempted. |
| **Pre-register / early access** | n/a | Open-source releases have no staged channel; play's mechanism has no honest equivalent here. Storeapp carries the user half. |
| "You might also like" / related rail | have | details page "More from this developer" plus the recommended rails; Storeapp's scored `similarAppsFor` is the portable improvement if a non-developer related rail is wanted. |
| Badges (Editors' Choice, Trending, Updated, …) | derived | `is_featured` / `is_editors_pick` already drive the hero pills; Storeapp's `badgesFor` adds the derivable ones (updated ≤30d, ≥10k stars, open source). |
| **Data Safety** panel | port | `PermissionsDisclosure.tsx` is the shipped neighbour (real `used_permissions`, "Not provided" states). A Data Safety *form* (collects/shares/encrypted) needs the publisher fields Storeapp models on `DataSafetyInfo`; the web port renders the same shape. |
| **"More by `<developer>`" page** | have | `/developer/[slug]` + `lib/catalog-developer-apps.ts` (`5.l.xiv.zi`). |
| Search sort (relevance/stars/updated/name/size) | have | `app/search/page.tsx` + `components/SearchSortFilter.tsx` + `lib/search-view.ts` (Track k port of Storeapp's `SearchSort`/`applySearchView`). |
| Search filters (installed/has-APK/min stars) | have (min rating) / n/a | The min-rating facet ships (`lib/search-view.ts` `minStars`, over `avg_rating`). Installed-only and has-APK need the device, so a web page cannot read them (the same limit `lib/open-intent.ts` documents) — `n/a` on the web. |
| "Watch trailer" (video) | port | Storeapp's `trailerUrlFor` pulls a real YouTube/Vimeo link out of the description; the web port renders one `<video>`/embed when present. |
| Content rating (age) | have | `App.content_rating` (`0.j.iii.zi`) in the hero stats row. |
| In-app purchases / price | n/a | Open-source releases; `MonetizationDisclosure.tsx` prints nothing when the source gave no data. |
| Play Pass / Points / gift cards / subscriptions | n/a | Google's own account-and-billing features. |
| Wi-Fi-only download setting | n/a (web) | A browser cannot tell the network type; the client setting is Storeapp-only. |
| Device compatibility ("works on your device") | n/a (web) | Same device-API limit as installed-state. |
| My apps & games / Updates (hamburger) | n/a (web) | Cannot read the device; the client's installed list is Storeapp-only. |
| Play Protect | port (reader) | The web already prints the checksum / signer claims the index carries (`PermissionsDisclosure` neighbour, install claims). The verify *gate* is the client's. |
| Notifications / push | have | `PushSync.tsx` + `NotifyToggle.tsx`; web push for the wishlist and updates. |
| Account / sign-in | n/a | This store has no account. |
| Library / order history / purchase history | n/a | Nothing is bought, so there is no history to show. |
| Subscriptions / in-app purchases / price | n/a | Already recorded in the consumer table above; repeated here as a hamburger entry for completeness. |
| Redeem / offers / Play Points / gift cards | n/a | Google's own programmes. |
| Payment methods | n/a | No user billing. |
| Parental controls / content filtering / family | port | Same gate as the client: only when the publisher supplies a `content_rating`. |
| Settings (theme, language, backup) | have (web subset) | Theme is the shared design layer; there is no device auto-update switch on the web (recorded `n/a` above). |
| Country / language preference | port | A locale selector could read the same `language` field the client uses; not built on the web. |

## 2. Play Console — publisher capabilities

The Console is Zealot's role in this program, not this repo's. The catalogue-side
rows this repo *reads* are below; the publishing rows live in Zealot's `handover.md`.

| Console capability | Web status | Where / note |
| --- | --- | --- |
| Publish release / listing metadata | have (reader) | `lib/sources/zealot.ts` reads the signed index; Zealot authors and signs it. |
| **Ratings & reviews data** | have (reader) | `avg_rating`/`rating_count`/`carried_over_reviews` off the index. Developer-reply authoring is a Console-side action (see §3). |
| **Data safety form** | port | Needs the index to publish the `DataSafetyInfo` shape Storeapp already models. |
| **Content rating questionnaire** | have (reader) | `content_rating` is read and shown; the questionnaire itself is Console UI. |
| Top-level `collections[]` registry | have | `5.j.ii.zo` reads it; `/collections` renders it. |
| Sponsored placement (`sponsored_slots`) | have | `5.j.ii.zi` reads it off each app. |
| Staged rollout / testing tracks | n/a (web) | No staged channel in the release feed; Storeapp's pre-register is the user-visible half. |
| App bundles (AAB) + dynamic delivery | n/a | Sources publish APKs; this storefront carries the download URL. |
| Crash / ANR / vitals dashboards | n/a | No telemetry, by design. |
| Play App Signing / key rotation | n/a | Out of scope; the client verifies signer continuity instead. |
| **Billing / payments (pricing, in-app purchases, subscriptions)** | reader / n/a | Zealot's console does run one money path — a publisher pays for a paid *store listing* through B-Pay-backend (`checkouts`, `store_listing_payment`) — and this storefront reads the resulting `is_published` / checkout state. There is still no user-facing billing in the catalogue (`MonetizationDisclosure.tsx` prints nothing when the source gave no data). |
| **Revenue / earnings reports, payouts, financial reporting** | n/a (web) | Belongs to Zealot's console, not the storefront; see Zealot's `handover.md`. |
| **App content / policy declarations** (Data safety, Content rating, Target audience, Ads, News) | have (reader) / port | Data safety and content rating are read off the index today; the target-audience and news declarations are `port` once the index publishes them. |

---

## 3. Porting notes (from Storeapp)

> **Gap inventory (operator-directed 2026-10-10):** extended with the Play Store hamburger-menu surfaces and the Play Console billing / revenue surfaces. The web status of each is in the table above; the rule that decided every row: a browser cannot read the device (so the installed-state and network-type facets stay `n/a`), and this catalogue has no accounts and no user billing (so sign-in, the library, and every price / subscription / offer row stay `n/a`). The revenue side of the store is Zealot's console role; this repo only reads what that console publishes.


Storeapp's row already holds the pure logic; this is what the web port needs on top:

1. **Pure functions** — `badgesFor`, `similarAppsFor`, `trailerUrlFor`,
   `installsLabelFor` port as-is (TypeScript translations of dependency-free Kotlin).
   `applySearchView` is **done** (`lib/search-view.ts`, Track k): its portable half
   (sort + `minStars`) ships; its device-only filters (`installedOnly`, `hasApkOnly`)
   are `n/a` on the web. `readInstalledPermissions` has no web equivalent — the
   web reads permissions the index already carries.
2. **UI shape** — `PlaySurfaces.kt` maps to the existing glass components here:
   badge chips → the hero pill styling, the rating line → `RatingSummary`, the
   reviews panel → `ReviewsList`, Data Safety → a new panel next to
   `PermissionsDisclosure`, the similar rail → the recommended rails.
3. **New backend columns** — a developer reply per review, and the Data Safety form
   fields (`collects`/`shares`/`encrypted_in_transit`/`deletable`), are the only
   things the web port needs that do not already exist in the `catalog_app` shape.
   Until they do, those panels render their explanatory empty state, not a placeholder.


---

## 4. Full cross-check, web status (operator-directed 2026-10-10; docs only, nothing built or run)

The full Play Store against Appstore table (with the consumer / enterprise tags) is in Storeapp's `docs/PLAY-PARITY.md`, section 4; the Console half is Zealot's. This section records only where the **website** differs from the client, and the operating principles the operator set.

## Operating principles for closing every gap *(operator directive, 2026-10-10)*

1. **Human steps are automated.** Anywhere Play puts a person in the loop (app review, policy decisions, content-rating questionnaires, appeals triage, support routing), this program builds an automated decision instead: a machine verdict with machine-readable reasons (pass, flag, reject), recorded on the release. A person is only the exception path (an appeal, or a verdict the automation marks as high risk), never a queue that publishing waits on. Existing rules stand: an update to an app that already has a previous version is never held (Zealot Task 48/49).
2. **Reviews are anonymous. No accounts, ever.** The intended design (not built; its own task, cut by the TSF before code): a device-bound pseudonymous key made on the phone (Android Keystore), one editable review per key per app, a proof-of-work challenge instead of a captcha service, rate limits per key and per network, automated moderation, and a visible "verified install" mark when the review came from the Appstore client with proof that the reviewed version was installed. The website accepts the same review with the proof-of-work token and no install mark. Developer replies are public. There is no sign-in, no email and no profile anywhere in this path.
3. **Everything else follows the industry-standard approach**, as the earlier decision records (D43-n, 47h and the rest) already do, and keeps this program's own intended approaches where a handover has recorded one (additive-only sources, signed catalog index, org signing key, CI signs everything, no telemetry by default).
4. **Reuse before writing.** Most missing areas already exist as open-source parts that can be assembled. The reuse map below lists them with a mark: **✓** = the project's own page was read in a search on 2026-10-10; **◇** = from the author's knowledge, not checked, so check licence and maintenance before adopting. Nothing in the map is adopted yet.
5. **Unofficial routes carry a stated risk.** A route that depends on a reverse-engineered or unpublished interface is listed with that risk, and is never the only path to a feature.


**Where the website differs from the client table** *(read from this repo's handover and its latest commits)*

| Feature | Web status |
|---|---|
| Install, update, uninstall | ➖ by design: the details page offers Download and Share only (a website cannot install an Android app) |
| Search sort and rating filter | ✅ (`lib/search-view.ts`, commit `aeedf79`) |
| Read ratings and reviews | ✅ (`RatingBoard`, `ReviewsList`) |
| Write a review | ❓ a star picker exists; whether submissions are anonymous, rate-limited and spam-checked is not confirmed here. Check before building the principle 2 path, and use the proof-of-work token (ALTCHA) rather than a captcha service |
| Data Safety panel | ◐ the component exists but the section was removed from the details page on 2026-10-08 |
| Report footer | ✅ |
| Share | ✅ |
| Wishlist or save | ❌ (the Save pill was removed with the install machinery) |
| More from this developer, similar rails | ✅ |
| Resumable download | ✅ (the download door passes `Range`, and refuses a short or compressed answer) |
| Search suggestions | ❓ no-JS GET form today; `pg_trgm` on the Supabase database is the cheap route |
| Content rating, age filter, device filter | ❌ wait on Zealot's declarations and device fields |
| Top charts, Kids tab | ◐ collections and sponsored slots only |

Reuse routes that apply to the web (ALTCHA, `pg_trgm`, Meilisearch, F-Droid index-v2) are in the reuse map in Storeapp's section 4.
