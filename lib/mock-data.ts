/**
 * Phase 0 dummy data layer (leaf 0.a.ii.zi).
 *
 * Per docs/D-STORE.md §1: "keep the underlying app catalog data (names,
 * categories, source links, licenses) as the seed dataset, and replace
 * everything else." So this file is NOT invented from scratch — it's
 * seeded from two real sources already in this repo:
 *
 *   1. legacy-symfony/.../Entity/Application.php and Category.php
 *      — the actual field set the old Doctrine catalog stored
 *      (slug, name, summary, description, site, source, tracker, donate,
 *      icon, colors, apk, version, license, is_published, install_count,
 *      avg_rating, rating_count, created_at, updated_at, category).
 *
 *   2. screenshot_1.png / screenshot_2.png (repo root) — real
 *      screenshots of the live Fossdroid catalog this codebase served.
 *      The sidebar categories and the "Theming" shelf apps below are
 *      transcribed directly from those images, and the F-Droid detail
 *      fields (version, added/updated dates, description copy) are
 *      transcribed from the app-detail screenshot.
 *
 * Fields absent from the old entity but required per docs/D-STORE.md §7
 * (`screenshots[]`, `changelog`, `install_count`, `avg_rating`,
 * `rating_count`, `is_featured`, `is_editors_pick`, `min_android_version`,
 * `size_mb`, `sha256_checksum`, `play_store_rejection_reason`,
 * `permissions[]`) are genuinely new — those are plausible dummy values,
 * clearly called out as such. Everything else (names, categories,
 * summaries, license, source/site links) reflects the real legacy catalog.
 *
 * `signing_certificate_fingerprint` was added later, by leaf 0.f.i.zo,
 * beyond §7's original list — the "Verify this APK" section needed a
 * code-signing certificate fingerprint (a distinct concept from
 * `sha256_checksum`, which is a hash of the APK file itself, not its
 * signer's certificate). Same treatment as the rest: a plausible dummy
 * value, not a real digest.
 *
 * This module is data only. The fetch layer that serves it behind the
 * same interface a real Supabase client will use later is leaf 0.a.ii.zo.
 */

export interface Category {
  slug: string;
  name: string;
  /** Icon identifier — matches Category.icon in the legacy entity (Material icon name in the original app). */
  icon: string;
}

/**
 * Individual star-rating submission — leaf `3.b.ii.zi` (Metrics
 * Pipeline, Aggregation). `docs/D-STORE.md` §5 lists `Review`
 * (anonymous, rate-limited) as a needed new entity but doesn't spec
 * its fields beyond that; scoped narrowly here to exactly what
 * `RateThisApp` (`0.e.iii.zo`) actually collects — a 1–5 star value,
 * no written text — rather than inventing a text-review UI that
 * doesn't otherwise exist anywhere in this codebase. Rate-limiting is
 * still a separately-scoped real-backend concern (`5.d.ii.zi`), same
 * as the install/view counters.
 */
export interface Review {
  id: string;
  app_slug: string; // App.slug
  stars: number; // 1-5
  created_at: string; // ISO date
}

/**
 * A scheduled sponsored-slot booking — leaf `3.c.i.zo` (Admin/Editorial
 * Tools, Featuring). Distinct from `SponsoredCard`'s own hardcoded
 * "Your app could be here" placeholder content (`0.d.iii.zo`): that
 * component's doc comment explains why sponsored content doesn't live
 * in the `App[]` catalog (no slug/detail page/rating of its own) — this
 * is the same reasoning applied to *scheduled* sponsored content, kept
 * as its own array rather than folded into `App` for the same reason.
 *
 * `name`/`summary` are the only creative fields, matching exactly what
 * `SponsoredCard` already renders (a name line + the "Sponsored" badge)
 * — no click-through URL yet, since the card itself isn't a `<Link>`
 * (see that component's comment on why: "no real click-through yet").
 * `start_date`/`end_date` are ISO dates (day granularity, no time-of-day
 * scheduling); a slot is active when today falls within `[start_date,
 * end_date]` inclusive — see `getActiveSponsoredSlot` in
 * `lib/catalog.ts` for the exact comparison.
 *
 * Empty by default: no sponsored slot is scheduled out of the box, so
 * `SponsoredCard` keeps rendering its existing static placeholder until
 * an admin schedules one via `/admin/sponsored` — the same "empty until
 * populated" posture `reviews` above already established.
 */
export interface SponsoredSlot {
  id: string;
  name: string;
  summary: string;
  start_date: string; // ISO date, YYYY-MM-DD
  end_date: string; // ISO date, YYYY-MM-DD
  created_at: string; // ISO date
}


export interface App {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  site: string | null;
  source: string | null;
  tracker: string | null;
  donate: string | null;
  icon: string;
  primary_color: string;
  secondary_color: string;
  tertiary_color: string;
  apk: string;
  version: string;
  license: string;
  is_published: boolean;
  category: string; // Category.slug
  created_at: string; // ISO date
  updated_at: string; // ISO date

  // --- New fields (docs/D-STORE.md §7), dummy values for Phase 0 ---
  install_count: number;
  /**
   * Genuinely new, like `signing_certificate_fingerprint` below — not
   * in §5's/§7's original field list, added by leaf `3.b.i.zo` to
   * support §4E's "View counters (powers Trending)" row, which the
   * original list never gave a backing field for. A plausible dummy
   * seed value per app, not a real count; the real counter is
   * `incrementViewCount` (`lib/catalog.ts`), mutated from the app
   * detail page via `app/api/apps/[slug]/view/route.ts`.
   */
  view_count: number;
  avg_rating: number;
  rating_count: number;
  is_featured: boolean;
  is_editors_pick: boolean;
  min_android_version: string;
  size_mb: number;
  sha256_checksum: string;
  signing_certificate_fingerprint: string;
  play_store_rejection_reason: string | null;
  permissions: string[];
  screenshots: string[];
  changelog: string;

  /**
   * Links to `Developer.slug` below — leaf 0.g.iii.zo. Unlike the rest
   * of this interface's "new fields" block, this isn't an invented
   * value: it's the GitHub/GitLab username or org already present in
   * this app's own real `source` URL, just pulled out into its own
   * field so a developer profile page has something stable to key on.
   * `Developer.bio`/`joined_at` are the actual dummy parts.
   */
  developer_slug: string;

  /**
   * Dummy — leaf 0.h.ii.zi. Real FOSS Android apps are essentially
   * never region-locked (no licensing/DRM reason to be), so this isn't
   * modeling a real constraint the way most of the §7 fields model a
   * real Play-Store-shaped one — it exists purely to give the
   * region-filter helper (0.h.ii.zo, next) something to actually
   * narrow against. Most apps below carry `ALL_REGIONS` (the honest
   * default for FOSS software); a few carry a deliberately narrower
   * dummy subset so that filter has a non-trivial case to prove it
   * works on, not just a no-op over an always-everywhere catalog.
   */
  available_regions: string[];

  /**
   * Dummy — leaf 0.j.iii.zi (the `0.j.iii` audit note's first finding:
   * not in `docs/D-STORE.md` §5's original field list, not in this
   * interface, before this leaf). Every app in this catalog is
   * genuinely `"Everyone"` — FOSS wallpaper/theming/utility/reading
   * apps, nothing here warrants a higher rating — so this isn't
   * introducing narrower dummy variety the way `available_regions`
   * did; `ContentRating` is still a full, typed vocabulary (matching
   * Play Store's actual rating tiers) so a future catalog addition
   * that *does* need a higher tier has a real value to reach for
   * instead of a loose `string`.
   */
  content_rating: ContentRating;

  /**
   * Dummy — leaf 0.j.iii.zo (the `0.j.iii` audit note's second finding:
   * distinct from `permissions[]`, 0.f.ii.zo — permissions are the
   * Android runtime grants an app can request; data safety is what
   * actually happens to any data once collected. Zero mentions of this
   * disclosure anywhere in `docs/D-STORE.md` or this file before the
   * `0.j.iii` audit).
   *
   * `shared_with_third_parties` is `false` for every app here on
   * purpose, not left unconsidered: no app in this catalog ships an ad
   * SDK or analytics vendor (FOSS-only catalog; D-Store's own
   * Sponsored shelf cards, Section 4A, are house ads at the shelf
   * level, never a per-app third-party integration), so there's no
   * honest way to model real third-party sharing for any of the 15.
   * `collects_data` does genuinely vary though: several apps read
   * something purely on-device to do their actual job (Battery Live
   * reads battery stats, MinCal Widget reads calendar events, Ledger
   * Vault stores financial entries locally) without that data ever
   * leaving the device — that's still "collects" per Play's own
   * definition, just never shared or transmitted.
   */
  data_safety: DataSafetyInfo;

  /**
   * Dummy — leaf 0.j.iv.zi (Play Store Parity Pass, disclosure gaps).
   * Both are uniformly `false` for all 15 apps here, and unlike
   * `available_regions` this isn't a case for inventing narrower
   * dummy variety to exercise the UI on a non-trivial case: F-Droid's
   * actual inclusion criteria prohibit ads and non-free/anti-features
   * dependencies outright, so a real F-Droid-sourced catalog entry
   * with either field `true` wouldn't be honest sample data, it would
   * misrepresent what this catalog actually is. Real Play Store
   * doesn't show a tag at all for an app with neither — same as here:
   * this leaf's UI only renders something when at least one is `true`,
   * so on this catalog the indicator correctly renders nothing for
   * every app, which is the accurate outcome, not a bug or an
   * unexercised code path (see `MonetizationDisclosure.tsx`'s own
   * header comment for how the "renders nothing" case was verified
   * given no catalog entry can exercise the "renders something" case
   * honestly).
   */
  contains_ads: boolean;
  has_in_app_purchases: boolean;

  /**
   * Catalog source — leaf `5.h.i.zi`. Required, like every field added
   * since `content_rating`: TypeScript's required-field check is the
   * integrity check that every literal below was updated.
   */
  origin: AppOrigin;

  /**
   * Android package identifier (e.g. `com.whatsapp`) — leaf `5.h.ii.zi`,
   * added for the Aptoide source adapter (`lib/sources/aptoide.ts`).
   * Optional because none of the current Zealot-origin dummy entries
   * carry one yet (Zealot's real signed index, once `5.g` lands, will).
   * `mergeCatalogSources` (`lib/sources/types.ts`) keys its dedupe on
   * this field when present, falling back to `slug` when it isn't —
   * see that function's comment for why a package-less app is never
   * deduped against another one by accident.
   */
  package_name?: string;
  /**
   * Publisher name as the source reports it — leaf `5.h.iii.zi`. Only
   * set for third-party apps, whose developers have no static
   * `Developer` row (so `getDeveloperBySlug` returns null for them and
   * the detail page had nothing to show); first-party apps keep
   * resolving their name through `Developer`.
   */
  developer_name?: string;
  /**
   * Fields the source genuinely did not provide — leaf `5.h.iii.zo`.
   * Absent (the default) means everything is provided, so no first-party
   * entry needed editing. A listed field still carries a typed
   * placeholder value (the `App` fields below are required), but the
   * UI must render "Not provided" for it instead of that value — the
   * placeholder exists so filters/sorts keep working, never to be shown
   * as a claim. Read through `isNotProvided` (`lib/trust.ts`).
   */
  not_provided?: NotProvidedField[];
}

/**
 * The `App` fields a third-party source can leave unknown, each with a
 * dedicated "Not provided" render path (`5.h.iii.zo`). Closed union so a
 * new field is a deliberate change every render site has to see.
 * `data_safety` is not listed: it already has its own `provided` flag
 * (`5.h.ii.zi`).
 */
export type NotProvidedField =
  | "permissions"
  | "play_store_status"
  | "monetization"
  | "min_android_version"
  | "content_rating";

/**
 * Which catalog source an app came from — leaf `5.h.i.zi` (Catalog Sources,
 * first-party-first; see HANDOVER.md "Resolved — catalog sources").
 *
 * - `"zealot"`: first-party. From the Console's signed catalog index
 *   (Zealot Tasks 27/29): verified, org-signed, downloaded from Zealot's
 *   stable route. Always shown first on the home page (`5.h.i.zo`).
 * - `"aptoide"`: third-party. Breadth of catalog via the Aptoide MCP
 *   (`5.h.ii`): labelled as third-party, downloaded from Aptoide, never
 *   carrying Zealot-derived claims (`5.h.iii`).
 *
 * A closed union on purpose: adding a third source is a deliberate
 * change every ordering/labelling call site has to see, not a free string.
 */
export type AppOrigin = "zealot" | "aptoide";

/** Play Store's actual content/age rating tiers. Every app in this dummy catalog is `"Everyone"` — see the `content_rating` field comment on `App` for why. */
export type ContentRating = "Everyone" | "Everyone 10+" | "Teen" | "Mature 17+" | "Adults only 18+";

/** See the `data_safety` field comment on `App` for why `shared_with_third_parties` is uniformly `false` while `collects_data`/`data_types` vary per app. */
export interface DataSafetyInfo {
  collects_data: boolean;
  /** Play's actual per-app category names (e.g. "Financial info", "App activity"). Empty when `collects_data` is `false`. */
  data_types: string[];
  shared_with_third_parties: boolean;
  data_encrypted_in_transit: boolean;
  can_request_data_deletion: boolean;
  /**
   * `false` when the source this app came from genuinely doesn't
   * disclose a Play-style data-safety section — leaf `5.h.ii.zi`,
   * added for the Aptoide adapter (Aptoide's API has no equivalent of
   * Play's Data Safety form). Optional and defaults to `true` via
   * `??` at every read site, so none of the existing dummy entries
   * needed editing. `DataSafety.tsx` renders "Not provided by source"
   * instead of the booleans below when this is `false` — following
   * this file's own honesty rule (see `0.j.iii`'s note above): a
   * `false` here does not mean "collects nothing," it means "unknown,"
   * and those are not the same claim.
   */
  provided?: boolean;
}

/**
 * ISO 3166-1 alpha-2 codes this dummy catalog treats as "available" —
 * a small representative set of large markets, not an exhaustive list
 * of all ~195 countries (this is Phase 0 scaffolding, not a real
 * geo-availability system). `"US"` being in this set is deliberate: it
 * matches `lib/ipapi.ts`'s `DEFAULT_REGION`, so a visitor whose
 * geolocation lookup fell back to the default still lands in a region
 * every app in `ALL_REGIONS` supports, rather than a fallback value
 * that happens to filter everything out.
 */
export const ALL_REGIONS = ["US", "GB", "DE", "FR", "CA", "AU", "IN", "BR", "JP"] as const;

/**
 * Developer profile — leaf 0.g.iii.zo (Search & Category Browse →
 * Related content → developer profile pages, per docs/D-STORE.md line
 * 35). Not in the legacy entity at all (Application.php has no author
 * concept) and not in §7's field list either — same "new, clearly
 * dummy" treatment `signing_certificate_fingerprint` got from 0.f.i.zo,
 * with one difference: `slug`, `name`, and `profile_url` aren't
 * invented, they're read directly off each app's real `source` repo
 * URL (e.g. `github.com/afzalmakkelamba/MaterialOS` → the developer
 * `afzalmakkelamba`). Only `bio` and `joined_at` are placeholder values.
 */
export interface Developer {
  slug: string;
  name: string;
  /** Dummy — no real bio exists for these accounts, this is placeholder copy. */
  bio: string;
  /** The real profile/org URL the app's `source` field already links into. */
  profile_url: string;
  /** Dummy — a plausible account-creation date, not a real one. */
  joined_at: string; // ISO date
}

/**
 * Category sidebar, transcribed in order from screenshot_1.png.
 * The list is cut off at "Development" in the screenshot — this repo
 * doesn't have visibility into categories below the fold, so the list
 * stops where the real screenshot stops rather than guessing further.
 */
export const categories: Category[] = [
  { slug: "system", name: "System", icon: "settings" },
  { slug: "multimedia", name: "Multimedia", icon: "play_circle" },
  { slug: "games", name: "Games", icon: "sports_esports" },
  { slug: "internet", name: "Internet", icon: "public" },
  { slug: "navigation", name: "Navigation", icon: "navigation" },
  { slug: "science-education", name: "Science & Education", icon: "school" },
  { slug: "theming", name: "Theming", icon: "palette" },
  { slug: "time", name: "Time", icon: "schedule" },
  { slug: "reading", name: "Reading", icon: "menu_book" },
  { slug: "writing", name: "Writing", icon: "edit" },
  { slug: "development", name: "Development", icon: "code" },
  // Finance — leaf 0.i.i.zo. Not in screenshot_1.png like everything
  // above; added specifically as the category the "Vault" CategoryTheme
  // register (lib/category-theme.ts) attaches to. Zero apps until the
  // dummy entry below.
  { slug: "finance", name: "Finance", icon: "account_balance" },
];

/**
 * App catalog — first-party (Zealot) entries only. Originally seeded
 * with 13 invented-but-labelled dummy "aptoide"-origin entries
 * (F-Droid + 12 Theming-shelf apps, transcribed from the legacy
 * screenshots — see this file's header comment) standing in for
 * third-party data until real ingestion existed. Leaf `5.h.ii.zo`
 * (cont.), operator priority override: all 13 were removed once real
 * Aptoide data was available to replace them — they no longer need a
 * stand-in. Real third-party apps now come exclusively through
 * `createAptoideSource()` (`lib/sources/aptoide.ts`), reading
 * `storage/downloads/aptoide-snapshot.json`, and are merged in at
 * request time by `lib/catalog.ts`'s `getMergedApps()` — nothing
 * "aptoide"-origin is hardcoded here anymore. `ledger-vault` and
 * `quiet-verse` below are the only entries left in this array; both are
 * genuinely `"zealot"` (first-party), per leaf `0.i.i.zo`.
 */
export const apps: App[] = [
  // The two entries below are new — leaf 0.i.i.zo. Unlike the removed
  // dummy entries (seeded from the legacy Doctrine entity / screenshots
  // per the header comment on this file), neither app nor its category
  // existed in the catalog before this leaf. They exist specifically to
  // give the "Vault" and "Sanctuary" CategoryTheme registers
  // (lib/category-theme.ts) a real app/category to attach to and
  // preview against, per the "Priority override" note in HANDOVER.md.
  {
    id: "14",
    slug: "ledger-vault",
    name: "Ledger Vault",
    summary: "Offline personal finance & budget ledger",
    description:
      "A local-first budgeting and net-worth ledger — accounts, envelopes, and recurring transactions tracked entirely on-device, no bank linking, no cloud sync.\n\n" +
      "Built for people who want the discipline of double-entry bookkeeping without a subscription, a server, or a data-sharing agreement attached to it.",
    site: null,
    source: "https://github.com/ledger-vault-app/ledger-vault",
    tracker: "https://github.com/ledger-vault-app/ledger-vault/issues",
    donate: null,
    icon: "ledger-vault.png",
    primary_color: "#0F6D4C",
    secondary_color: "#B8942E",
    tertiary_color: "#0A2E22",
    apk: "app.ledgervault.android_21.apk",
    version: "2.1",
    license: "GPL-3.0",
    is_published: true,
    category: "finance",
    created_at: "2017-01-12T00:00:00Z",
    updated_at: "2017-05-30T00:00:00Z",

    install_count: 9640,
    view_count: 14800,
    avg_rating: 4.5,
    rating_count: 312,
    is_featured: false,
    is_editors_pick: true,
    min_android_version: "5.0",
    size_mb: 9.2,
    sha256_checksum: "7c3f9a1d4e8b62057fca9b3d1e6f8a2c04b7d9e5f1a3c6082b4d7e9f0a1c2d3e",
    signing_certificate_fingerprint: "4A:1F:0C:8E:D5:3B:7A:29:F6:C1:D8:04:E2:9B:56:A7:3C:F0:1D:8E:64:2A:B9:07:D5:3E:1C:A8:F4:60:9D:2B",
    play_store_rejection_reason: null,
    permissions: ["WRITE_EXTERNAL_STORAGE"],
    screenshots: ["/mock/screenshots/ledger-vault-1.png", "/mock/screenshots/ledger-vault-2.png"],
    changelog: "Added recurring-transaction rules and a net-worth trendline.",
    developer_slug: "ledger-vault-app",
    content_rating: "Everyone",
    data_safety: {
      collects_data: true,
      data_types: ["Financial info", "App activity"],
      shared_with_third_parties: false,
      data_encrypted_in_transit: true,
      can_request_data_deletion: true,
    },
    contains_ads: false,
    has_in_app_purchases: false,
    available_regions: [...ALL_REGIONS],
    origin: "zealot",
  },
  {
    id: "15",
    slug: "quiet-verse",
    name: "Quiet Verse",
    summary: "Offline scripture reading & daily reflection",
    description:
      "A distraction-free scripture reader — full offline text, adjustable type size, and a daily reading plan with space for short written reflections alongside each passage.\n\n" +
      "No accounts, no social layer, no notifications beyond an optional daily reading reminder.",
    site: null,
    source: "https://github.com/quiet-verse/quiet-verse-android",
    tracker: "https://github.com/quiet-verse/quiet-verse-android/issues",
    donate: null,
    icon: "quiet-verse.png",
    primary_color: "#5B7FBD",
    secondary_color: "#C7D6F0",
    tertiary_color: "#2E4876",
    apk: "org.quietverse.reader_14.apk",
    version: "1.4",
    license: "MIT",
    is_published: true,
    category: "reading",
    created_at: "2016-09-02T00:00:00Z",
    updated_at: "2017-02-18T00:00:00Z",

    install_count: 5310,
    view_count: 8100,
    avg_rating: 4.8,
    rating_count: 198,
    is_featured: false,
    is_editors_pick: true,
    min_android_version: "4.4",
    size_mb: 12.4,
    sha256_checksum: "1e9d4b6a2f7c30581bde6a4f9c2b7d0158e3a6f9c1b4d7e0a2c5f8b1d4e7a0c3",
    signing_certificate_fingerprint: "8D:2A:F6:1C:09:B4:E7:53:A0:D8:6F:12:C4:97:3E:B0:5D:A9:2F:1C:68:03:E4:B7:9A:0D:5C:F2:81:4E:06:39",
    play_store_rejection_reason: null,
    permissions: [],
    screenshots: ["/mock/screenshots/quiet-verse-1.png", "/mock/screenshots/quiet-verse-2.png"],
    changelog: "Added adjustable type size and a daily reading reminder toggle.",
    developer_slug: "quiet-verse",
    content_rating: "Everyone",
    data_safety: {
      collects_data: true,
      data_types: ["App activity"],
      shared_with_third_parties: false,
      data_encrypted_in_transit: true,
      can_request_data_deletion: true,
    },
    contains_ads: false,
    has_in_app_purchases: false,
    available_regions: [...ALL_REGIONS],
    origin: "zealot",
  },
];

/**
 * Individual `Review` rows — leaf `3.b.ii.zi`. Starts empty
 * deliberately, unlike `apps` above: every app's existing
 * `avg_rating`/`rating_count` is itself an aggregate-only dummy seed
 * with no underlying per-review rows to backfill (same as
 * `install_count`/`view_count` never had backing "install event"/
 * "view event" rows) — so there's nothing honest to pre-populate this
 * with. Real reviews accumulate here from `submitReview`
 * (`lib/catalog.ts`) onward; see that function for how a fresh
 * `Review` folds into the pre-existing seed aggregate rather than
 * discarding or double-counting it.
 */
export const reviews: Review[] = [];

/** Scheduled sponsored-slot bookings — leaf `3.c.i.zo`. See `SponsoredSlot` above for why this is empty by default. */
export const sponsoredSlots: SponsoredSlot[] = [];

/**
 * One recorded search — leaf `3.c.ii.zo`. `query` is stored exactly as
 * typed (for display / debugging a specific hit); aggregation for the
 * top-searches dashboard case-folds it, so `"Chat"` and `"chat"` count
 * toward the same ranked row without needing two stored variants here.
 */
export interface SearchQueryLog {
  id: string;
  query: string;
  created_at: string; // ISO datetime
}

/** Logged searches — leaf `3.c.ii.zo`. Empty by default, same "empty until populated" posture `reviews`/`sponsoredSlots` above already established; fills up as `/search` is hit. */
export const searchQueries: SearchQueryLog[] = [];

/**
 * Developer profiles — leaf 0.g.iii.zo. One per `App.developer_slug`
 * above, `slug`/`name`/`profile_url` read off each app's real `source`
 * URL (see the field comment on `Developer` for why), `bio`/`joined_at`
 * are dummy placeholders. `joined_at` is pinned a little before that
 * developer's earliest `created_at` in `apps` — plausible account age,
 * not a real signup date.
 */
export const developers: Developer[] = [
  // The 13 developer entries that used to sit here (fdroid,
  // afzalmakkelamba, nagracks, blackjackdavy, jamiesanson,
  // tommy-geenexus, dreamingincodezh, klaernie, amexia-theme,
  // enhancement-theme, mozilla, icecons, greyscale-theme) belonged to
  // the 13 dummy "aptoide"-origin apps removed from `apps` above (leaf
  // `5.h.ii.zo`, cont.) and are removed with them — they'd otherwise be
  // orphaned rows with no app pointing at them. Real third-party apps'
  // developer info comes from Aptoide's own response
  // (`normalizeAptoideApp` in `lib/sources/aptoide.ts` sets
  // `developer_slug` from it directly); it isn't backed by a static
  // entry in this array, so `/developer/[slug]` for a third-party app's
  // developer_slug currently resolves to nothing via
  // `getDeveloperBySlug` (`lib/catalog.ts`) — a real gap, not silently
  // patched over here, and the same gap the WhatsApp seed (`5.h.ii.zi`)
  // already had. Flagged forward for `5.h.iii.zi` (third-party trust
  // labelling), which is already the leaf suppressing other
  // first-party-only UI (Verified badge, "Verify this APK") for
  // third-party apps.
  //
  // The two entries below are new — leaf 0.i.i.zo, alongside their apps
  // in the `apps` array above.
  {
    slug: "ledger-vault-app",
    name: "Ledger Vault",
    bio: "Local-first personal finance tools — no bank linking, no cloud sync.",
    profile_url: "https://github.com/ledger-vault-app",
    joined_at: "2016-11-20T00:00:00Z",
  },
  {
    slug: "quiet-verse",
    name: "Quiet Verse",
    bio: "A small, distraction-free scripture reader with no accounts and no social layer.",
    profile_url: "https://github.com/quiet-verse",
    joined_at: "2016-06-15T00:00:00Z",
  },
];

/** Number of catalog apps per category, derived from `apps` — not hand-maintained. */
export function appCountByCategory(categorySlug: string): number {
  return apps.filter((app) => app.category === categorySlug).length;
}
