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
 * Editorial collection — leaf `4.c.ii.zo` (docs/D-STORE.md §A, "Editorial
 * collections (e.g. 'Privacy Tools')"). Genuinely new: the `5.g.i.zo`
 * cross-repo review confirmed no `Collection` concept exists on either
 * this repo's or Zealot's side yet. Distinct from `Category` — a
 * category is one fixed home per app (`App.category`), while a
 * collection is a human-curated cross-cutting theme any number of apps
 * from any category can belong to (same relationship `is_editors_pick`
 * already has to the rest of the catalog, just named/described and
 * with more than one instance).
 *
 * `app_package_names` rather than `app_slugs`: the only apps in the
 * live catalog today are Aptoide-origin (`5.h.iv.zi` removed the last
 * first-party dummy entries), and `package_name` — not `slug` — is
 * this repo's stable, source-independent join key for an app (see
 * `lib/sources/types.ts`'s `mergeCatalogSources`, which dedupes on the
 * same field). A collection referencing slugs would silently break if
 * a future re-import ever changed how a slug gets derived; the package
 * name won't.
 */
export interface Collection {
  slug: string;
  name: string;
  description: string;
  app_package_names: string[];
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
 * A sponsored-placement window on a real catalog app — leaf `5.j.ii.zi`.
 * **Retires** the standalone `SponsoredSlot` entity this file used to
 * define (its own id/name/summary/dates, scheduled via `/admin/sponsored`
 * and never folded into `App[]`): per the cross-repo "sponsored placement
 * & collections" decision recorded in `HANDOVER.md`, real Play-Store-style
 * sponsored placement uses the app's *own* listing as the creative — no
 * separate ad copy — so this is now just a `[{starts_at, ends_at}]` window
 * living directly on `App.sponsored_slots` (matches Zealot's signed index
 * shape exactly, `$defs/app.sponsored_slots` in `catalog_index_v2.schema.json`),
 * not a distinct entity with its own name/summary to keep in sync.
 *
 * Authoring moved to the Zealot Console (`5.j.i.zo`) — this repo only
 * reads the window and, when today falls within `[starts_at, ends_at]`
 * inclusive, renders that app as the sponsored card via
 * `getActiveSponsoredSlot` in `lib/catalog.ts`. ISO date-times (not
 * day-only dates like the old entity), matching the index's own
 * `format: date-time` fields.
 */
export interface AppSponsoredSlot {
  starts_at: string; // ISO date-time
  ends_at: string; // ISO date-time
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

  /**
   * Sponsored-placement windows — leaf `5.j.ii.zi`. See
   * `AppSponsoredSlot` above for why this replaced the old standalone
   * `SponsoredSlot` entity. Empty for every app until a real window is
   * published (Aptoide-origin apps always carry `[]` — sponsorship is a
   * first-party Console feature, same "editorial calls are first-party-
   * only" posture `is_featured`/`is_editors_pick` already use).
   */
  sponsored_slots: AppSponsoredSlot[];
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
   * The publisher's own website when the source supplies one (Aptoide:
   * `developer.website`) — leaf `5.h.iv.zi`. Feeds the derived
   * `Developer.profile_url`; `null`/absent means not provided.
   */
  developer_website?: string | null;
  /**
   * "Verified developer" status — leaf `5.g.iii.zi`. Sourced from the
   * verified-developer flag in the Console's (Zealot's) signed catalog
   * index, per `docs/D-STORE.md` §7's "Catalog source" row ("publisher
   * and verified-developer flag"). This is Zealot-derived attestation
   * about the *developer's* agreement/identity status with the
   * Console — a different claim from `sha256_checksum`/
   * `signing_certificate_fingerprint`'s "Verify this APK" (which is
   * about one specific file) — so it gets its own field rather than
   * being folded into either.
   *
   * Required, like `is_featured`/`is_editors_pick`: those two are also
   * editorial/agreement flags that only ever come from the Console,
   * default `false` for a third-party (Aptoide) entry with no such
   * relationship to attest to. `isThirdParty` (`lib/trust.ts`) is still
   * the gate the detail page reads through before rendering the
   * badge — not because this field could honestly disagree with it
   * today (every non-`zealot` source sets `false`), but so a future
   * third source inherits the same suppression `is_featured`/
   * `is_editors_pick`'s own "editorial calls are first-party-only"
   * comment already documents, instead of relying on every adapter
   * remembering to set this one field correctly forever.
   */
  developer_verified: boolean;
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
  /** `null` = not provided by the source. Aptoide carries no developer bio; nothing is invented. */
  bio: string | null;
  /** The developer's own site/profile URL when the source supplies one (Aptoide: `developer.website`), else `null`. */
  profile_url: string | null;
  /** ISO date; `null` = not provided. Aptoide carries no developer sign-up date. */
  joined_at: string | null;
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
 * Editorial collections — leaf `4.c.ii.zo`. Real editorial curation
 * against the actual 12 real, live Aptoide-origin apps (`5.h.iv.zi`),
 * not invented placeholder entries — same "no fabricated content"
 * principle this file's other post-`5.h.iv.zi` comments already
 * follow. "Privacy Tools" is deliberately not every app that could
 * plausibly be *associated* with privacy (that would drift into
 * curating-by-vibes); each member is here because its own real
 * Aptoide listing text (`storage/downloads/aptoide-snapshot.json`,
 * `media.description`) makes a specific, checkable privacy-relevant
 * claim: Firefox's actual description leads with "a private web
 * browser designed to protect your data, block trackers"; Obsidian's
 * describes itself as working "on top of a local folder of plain text
 * Markdown files" (local-first by architecture, not just by
 * marketing); ReadEra's states plainly "No register" (no account, so
 * no identity tied to reading activity) alongside "no ads." The
 * other 9 apps in the catalog (WhatsApp, Termux, VLC, Waze, Khan
 * Academy, GO Launcher Prime, Simple Alarm Clock, GitHub, My Expenses)
 * make no such claim in their own listing text, so none are included
 * here — `App.data_safety`/`contains_ads` can't be used as the
 * criterion instead, since `lib/sources/aptoide.ts` currently sets
 * those identically (`false`) for every Aptoide app as a documented
 * placeholder, not real per-app disclosure data; using a field that
 * can't actually distinguish apps would make this collection look
 * data-driven when it isn't. A three-app collection is honest given
 * today's 12-app catalog rather than padded to look fuller — the
 * general mechanism (this array, `getCollections`/`getCollectionApps`
 * in `lib/catalog.ts`, `/collections` + `/collections/[slug]`) is what
 * this leaf actually delivers, and it supports adding more collections
 * or backfilling this one the moment the catalog (`5.h.vi`, still
 * open) grows past its current 12 hand-curated packages.
 */
export const collections: Collection[] = [
  {
    slug: "privacy-tools",
    name: "Privacy Tools",
    description:
      "Apps that make a specific, checkable privacy claim in their own listing — tracker-blocking, local-first storage, or no forced account.",
    app_package_names: ["org.mozilla.firefox", "md.obsidian", "org.readera"],
  },
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
 * "aptoide"-origin is hardcoded here anymore.
 *
 * Leaf `5.h.iv.zi`, operator request ("remove all dummy data"): the last
 * two entries, `ledger-vault` and `quiet-verse` (the invented first-party
 * stand-ins `0.i.i.zo` added so the Vault/Sanctuary category themes had
 * something to preview), were removed too. This array is now empty on
 * purpose: first-party apps arrive from Zealot's signed catalog index
 * (`5.g.i.zi`), not from literals here, and `createZealotSource()`
 * (`lib/catalog.ts`) reads this array only as that source's placeholder
 * until the index reader exists. Nothing in this file is dummy app data
 * anymore.
 */
export const apps: App[] = [];

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
 * Static developer profiles — leaf 0.g.iii.zo, emptied by `5.h.iv.zi`.
 *
 * The dummy rows that used to live here (13 for the removed third-party
 * apps, then 2 for the removed first-party stand-ins) are gone.
 * `getDeveloperBySlug` (`lib/catalog.ts`) now derives a `Developer` from
 * the merged catalog's own per-app data (`developer_slug`,
 * `developer_name`, plus the website the source supplied), and this
 * array is only consulted first so a future first-party developer
 * profile from Zealot's index can override the derived one.
 */
export const developers: Developer[] = [];
