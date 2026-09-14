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
];

/**
 * App catalog. 13 apps: F-Droid (System, from the detail-page screenshot)
 * plus the 12 apps shown on the Theming category's "What's new" shelf
 * (homepage screenshot). Categories with no visible apps in either
 * screenshot are left with zero entries here rather than padded with
 * invented apps — `appCount` below reflects that honestly.
 */
export const apps: App[] = [
  {
    id: "1",
    slug: "f-droid",
    name: "F-Droid",
    summary: "Application manager",
    description:
      "Connects to F-Droid compatible repositories. The default repo is hosted at f-droid.org, which contains only bona fide FOSS.\n\n" +
      "Android is open in the sense that you are free to install apks from anywhere you wish, but there are many good reasons for using a client/repository setup:\n\n" +
      "- Be notified when updates are available\n" +
      "- Keep track of older and beta versions\n" +
      "- Filter apps that aren't compatible with the device\n" +
      "- Find apps via categories and searchable descriptions\n" +
      "- Access associated urls for donations, source code etc.\n" +
      "- Stay safe by checking repo index signatures and apk hashes",
    site: "https://f-droid.org",
    source: "https://gitlab.com/fdroid/fdroidclient",
    tracker: "https://gitlab.com/fdroid/fdroidclient/-/issues",
    donate: "https://f-droid.org/about/#donate",
    icon: "f-droid.png",
    primary_color: "#1976D2",
    secondary_color: "#90CAF9",
    tertiary_color: "#0D47A1",
    apk: "org.fdroid.fdroid_0102.apk",
    version: "0.102",
    license: "GPL-3.0",
    is_published: true,
    category: "system",
    created_at: "2011-01-17T00:00:00Z",
    updated_at: "2016-11-30T00:00:00Z",

    install_count: 128430,
    avg_rating: 4.6,
    rating_count: 3021,
    is_featured: true,
    is_editors_pick: true,
    min_android_version: "4.1",
    size_mb: 6.8,
    sha256_checksum: "d32b26f2b83eb63f82c3ab33f43e8db4bfe9f6cc87df2f8d6ce3f341b09f6712",
    signing_certificate_fingerprint: "2B:00:47:7F:16:7A:59:E7:DB:30:7D:A9:C7:72:7C:C4:35:8C:65:9E:84:7C:9A:8B:82:3E:4E:45:81:81:F8:64",
    play_store_rejection_reason:
      "Facilitates installation of applications from outside Google Play, which violates Play Store distribution policy.",
    permissions: ["INTERNET", "ACCESS_NETWORK_STATE", "REQUEST_INSTALL_PACKAGES", "WRITE_EXTERNAL_STORAGE"],
    screenshots: ["/mock/screenshots/f-droid-1.png", "/mock/screenshots/f-droid-2.png"],
    changelog: "Improved repo index signature verification and faster mirror fallback.",
  },
  {
    id: "2",
    slug: "materialos",
    name: "MaterialOS",
    summary: "Material Design CyanogenMod 12 theme",
    description:
      "A Material Design theme built for CyanogenMod 12, bringing flat colors, bold typography, and consistent iconography across system UI.",
    site: null,
    source: "https://github.com/afzalmakkelamba/MaterialOS",
    tracker: "https://github.com/afzalmakkelamba/MaterialOS/issues",
    donate: null,
    icon: "materialos.png",
    primary_color: "#00BCD4",
    secondary_color: "#B2EBF2",
    tertiary_color: "#00838F",
    apk: "com.afzal.materialos_14.apk",
    version: "1.4",
    license: "Apache-2.0",
    is_published: true,
    category: "theming",
    created_at: "2015-03-02T00:00:00Z",
    updated_at: "2016-06-11T00:00:00Z",

    install_count: 18230,
    avg_rating: 4.1,
    rating_count: 402,
    is_featured: true,
    is_editors_pick: false,
    min_android_version: "5.0",
    size_mb: 3.2,
    sha256_checksum: "a061e574c854ea5e167ec0c05fb3af53ff1d84c464308f0aa7417008998eb4d0",
    signing_certificate_fingerprint: "AF:C1:6F:09:71:42:0D:16:B7:92:76:E0:86:5A:63:D0:50:EF:B2:92:03:C5:F4:61:67:85:55:16:84:CB:D3:0C",
    play_store_rejection_reason: "Themes system UI components, which Play Store policy restricts for non-OEM apps.",
    permissions: ["WRITE_SETTINGS"],
    screenshots: ["/mock/screenshots/materialos-1.png"],
    changelog: "Updated icon pack for CM12.1 compatibility.",
  },
  {
    id: "3",
    slug: "battery-live",
    name: "Battery Live",
    summary: "Set the wallpaper based on the current battery level",
    description:
      "A live wallpaper that changes its appearance based on the current battery level, giving you an at-a-glance read on charge without opening the status bar.",
    site: null,
    source: "https://github.com/nagracks/BatteryLive",
    tracker: "https://github.com/nagracks/BatteryLive/issues",
    donate: null,
    icon: "battery-live.png",
    primary_color: "#F57C00",
    secondary_color: "#FFE0B2",
    tertiary_color: "#E65100",
    apk: "com.nagracks.batterylive_10.apk",
    version: "1.0",
    license: "GPL-3.0",
    is_published: true,
    category: "theming",
    created_at: "2016-01-20T00:00:00Z",
    updated_at: "2016-01-20T00:00:00Z",

    install_count: 5410,
    avg_rating: 3.9,
    rating_count: 88,
    is_featured: false,
    is_editors_pick: false,
    min_android_version: "4.4",
    size_mb: 1.1,
    sha256_checksum: "b762e95d920eb276b2236c39431568332bf042354ed14026686160016a1d0c36",
    signing_certificate_fingerprint: "0C:68:04:0F:5F:16:D7:DC:2F:03:EF:60:9A:5B:9C:5E:C7:E9:CC:7C:1C:0B:B4:E4:EF:A7:C5:83:07:6E:7C:34",
    play_store_rejection_reason: null,
    permissions: ["BATTERY_STATS"],
    screenshots: ["/mock/screenshots/battery-live-1.png"],
    changelog: "Initial release.",
  },
  {
    id: "4",
    slug: "simply-solid",
    name: "Simply Solid",
    summary: "Set solid colors as background",
    description:
      "Does exactly one thing: sets a flat, solid color as your home and lock screen wallpaper. No gradients, no noise textures — just a clean color picker.",
    site: null,
    source: "https://github.com/BlackjackDavy/SimplySolid",
    tracker: null,
    donate: null,
    icon: "simply-solid.png",
    primary_color: "#D32F2F",
    secondary_color: "#FFCDD2",
    tertiary_color: "#B71C1C",
    apk: "com.blackjackdavy.simplysolid_20.apk",
    version: "2.0",
    license: "MIT",
    is_published: true,
    category: "theming",
    created_at: "2014-11-05T00:00:00Z",
    updated_at: "2015-09-14T00:00:00Z",

    install_count: 9870,
    avg_rating: 4.3,
    rating_count: 210,
    is_featured: false,
    is_editors_pick: true,
    min_android_version: "4.0",
    size_mb: 0.6,
    sha256_checksum: "b0f3ed9a1a8a12bbb7b63eaef1e5d7cf21a93894a39e0a724e2b96ce09dbf8f1",
    signing_certificate_fingerprint: "18:B0:27:34:E0:2B:4D:FE:0A:1D:B2:C8:40:2D:F3:A5:7C:9B:77:11:C8:BD:3A:F2:61:25:94:AF:18:3A:29:1B",
    play_store_rejection_reason: null,
    permissions: ["SET_WALLPAPER"],
    screenshots: ["/mock/screenshots/simply-solid-1.png"],
    changelog: "Added a saved-colors palette.",
  },
  {
    id: "5",
    slug: "night-mode-enabler",
    name: "Night Mode Enabler",
    summary: "Enable NightMode on Android 7+",
    description:
      "Exposes the hidden UiModeManager night-mode toggle built into Android 7 and later, letting you force system-wide dark mode without root.",
    site: null,
    source: "https://github.com/jamiesanson/NightModeEnabler",
    tracker: "https://github.com/jamiesanson/NightModeEnabler/issues",
    donate: null,
    icon: "night-mode-enabler.png",
    primary_color: "#263238",
    secondary_color: "#607D8B",
    tertiary_color: "#000000",
    apk: "com.jamiesanson.nme_11.apk",
    version: "1.1",
    license: "Apache-2.0",
    is_published: true,
    category: "theming",
    created_at: "2016-08-27T00:00:00Z",
    updated_at: "2016-10-02T00:00:00Z",

    install_count: 22740,
    avg_rating: 4.4,
    rating_count: 560,
    is_featured: true,
    is_editors_pick: false,
    min_android_version: "7.0",
    size_mb: 0.9,
    sha256_checksum: "8909dfed62b00d4fbf985a5223696055667d3caae71f7004787d4376dec8b64b",
    signing_certificate_fingerprint: "9F:D5:1F:31:5F:D3:8D:72:DB:3D:51:8C:E1:10:83:AE:EA:33:62:98:C8:E0:65:E2:57:62:41:B9:9E:10:7F:21",
    play_store_rejection_reason: "Relies on a hidden system API not exposed via the public Android SDK.",
    permissions: ["WRITE_SECURE_SETTINGS"],
    screenshots: ["/mock/screenshots/night-mode-enabler-1.png"],
    changelog: "Fixed toggle state not persisting across reboot.",
  },
  {
    id: "6",
    slug: "mincal-widget",
    name: "MinCal Widget",
    summary: "Minimal month calendar widget",
    description:
      "A minimal, no-frills month-view calendar widget for your home screen. Reads your existing calendar events; adds nothing of its own to sync.",
    site: null,
    source: "https://github.com/tommy-geenexus/mincal-widget",
    tracker: "https://github.com/tommy-geenexus/mincal-widget/issues",
    donate: "https://www.buymeacoffee.com/tommygeenexus",
    icon: "mincal-widget.png",
    primary_color: "#455A64",
    secondary_color: "#CFD8DC",
    tertiary_color: "#263238",
    apk: "com.tommygeenexus.mincal_32.apk",
    version: "3.2",
    license: "GPL-3.0",
    is_published: true,
    category: "theming",
    created_at: "2013-06-14T00:00:00Z",
    updated_at: "2016-04-19T00:00:00Z",

    install_count: 31200,
    avg_rating: 4.5,
    rating_count: 890,
    is_featured: false,
    is_editors_pick: true,
    min_android_version: "4.1",
    size_mb: 1.4,
    sha256_checksum: "7be792875765453369ff4dfb54c8e1fb6e68652ed9019050a3c0141f6f422e83",
    signing_certificate_fingerprint: "89:52:D8:15:5A:40:C3:03:0A:EE:86:CB:6B:A6:E5:6E:8A:51:63:D9:F3:3D:AB:19:83:DA:89:00:B0:4D:0C:03",
    play_store_rejection_reason: null,
    permissions: ["READ_CALENDAR"],
    screenshots: ["/mock/screenshots/mincal-widget-1.png", "/mock/screenshots/mincal-widget-2.png"],
    changelog: "Added widget resize handles for 4x2 and 4x3 layouts.",
  },
  {
    id: "7",
    slug: "awesomewallpaper",
    name: "AwesomeWallpaper",
    summary: "Live wallpaper with a happy little glow",
    description:
      "A gentle animated live wallpaper with a soft ambient glow effect. Battery-friendly — pauses rendering when the screen is off.",
    site: null,
    source: "https://github.com/DreaminginCodeZH/AwesomeWallpaper",
    tracker: "https://github.com/DreaminginCodeZH/AwesomeWallpaper/issues",
    donate: null,
    icon: "awesomewallpaper.png",
    primary_color: "#7CB342",
    secondary_color: "#DCEDC8",
    tertiary_color: "#33691E",
    apk: "me.zhanghai.android.awesomewallpaper_15.apk",
    version: "1.5",
    license: "Apache-2.0",
    is_published: true,
    category: "theming",
    created_at: "2016-02-09T00:00:00Z",
    updated_at: "2016-07-03T00:00:00Z",

    install_count: 4120,
    avg_rating: 4.0,
    rating_count: 61,
    is_featured: false,
    is_editors_pick: false,
    min_android_version: "5.0",
    size_mb: 2.3,
    sha256_checksum: "d64d1234b2337bef4aec48425f8f6fecf6f2124aa44581446eb74fafe886a5d4",
    signing_certificate_fingerprint: "02:95:F2:CA:43:8F:D6:5A:3B:DC:41:4B:48:9F:6A:13:71:11:F4:A8:FE:7D:44:0E:EC:19:01:58:7F:C9:E6:D5",
    play_store_rejection_reason: null,
    permissions: [],
    screenshots: ["/mock/screenshots/awesomewallpaper-1.png"],
    changelog: "Smoother glow animation curve.",
  },
  {
    id: "8",
    slug: "paper-foss-theme",
    name: "Paper FOSS Theme",
    summary: "Icon theme",
    description:
      "A paper-cutout style icon theme covering common FOSS/F-Droid apps, designed to sit consistently alongside stock AOSP icons.",
    site: null,
    source: "https://github.com/klaernie/PaperFossTheme",
    tracker: null,
    donate: null,
    icon: "paper-foss-theme.png",
    primary_color: "#FFA000",
    secondary_color: "#FFECB3",
    tertiary_color: "#FF6F00",
    apk: "org.klaernie.paperfoss_08.apk",
    version: "0.8",
    license: "CC-BY-SA-4.0",
    is_published: true,
    category: "theming",
    created_at: "2015-05-30T00:00:00Z",
    updated_at: "2016-03-11T00:00:00Z",

    install_count: 2870,
    avg_rating: 4.2,
    rating_count: 47,
    is_featured: false,
    is_editors_pick: false,
    min_android_version: "4.1",
    size_mb: 4.6,
    sha256_checksum: "6a127822416a7526c1404c42c66bb0579820d4a7eb8895ebdfb607d8a693ab01",
    signing_certificate_fingerprint: "5A:CE:BF:94:FF:5F:BD:C6:CF:E7:BD:20:AD:CA:06:E6:9D:91:22:85:AA:4D:67:F8:D5:01:E2:9C:93:F2:73:6B",
    play_store_rejection_reason: null,
    permissions: [],
    screenshots: ["/mock/screenshots/paper-foss-theme-1.png"],
    changelog: "Added icons for 12 more apps.",
  },
  {
    id: "9",
    slug: "amexia",
    name: "Amexia",
    summary: "Port of TwelF CMTheme for many devices",
    description:
      "A port of the TwelF CyanogenMod theme, adapted for a wider range of devices and CM builds than the original release supported.",
    site: null,
    source: "https://github.com/amexia-theme/amexia",
    tracker: "https://github.com/amexia-theme/amexia/issues",
    donate: null,
    icon: "amexia.png",
    primary_color: "#C2185B",
    secondary_color: "#F8BBD0",
    tertiary_color: "#880E4F",
    apk: "com.amexia.theme_21.apk",
    version: "2.1",
    license: "GPL-3.0",
    is_published: true,
    category: "theming",
    created_at: "2014-07-22T00:00:00Z",
    updated_at: "2015-12-08T00:00:00Z",

    install_count: 6540,
    avg_rating: 3.8,
    rating_count: 134,
    is_featured: false,
    is_editors_pick: false,
    min_android_version: "4.4",
    size_mb: 5.9,
    sha256_checksum: "eae9bab600f76d2ada27594dc05a3980464e431cd0cb495df9dc950d314f9277",
    signing_certificate_fingerprint: "E5:B4:DD:13:5E:39:11:73:31:B8:3E:31:65:13:EF:1F:9A:01:14:B2:56:40:AE:FE:3C:36:BE:6D:94:0A:7E:C3",
    play_store_rejection_reason: "Themes system UI components, which Play Store policy restricts for non-OEM apps.",
    permissions: ["WRITE_SETTINGS"],
    screenshots: ["/mock/screenshots/amexia-1.png"],
    changelog: "Fixed status bar icon contrast on CM13.",
  },
  {
    id: "10",
    slug: "enhancement",
    name: "Enhancement",
    summary: "White theme for CM13",
    description:
      "A clean white theme built specifically for CyanogenMod 13, covering system UI, settings, and the default dialer/messaging apps.",
    site: null,
    source: "https://github.com/enhancement-theme/enhancement",
    tracker: null,
    donate: null,
    icon: "enhancement.png",
    primary_color: "#FAFAFA",
    secondary_color: "#EEEEEE",
    tertiary_color: "#BDBDBD",
    apk: "com.enhancement.theme_10.apk",
    version: "1.0",
    license: "Apache-2.0",
    is_published: true,
    category: "theming",
    created_at: "2016-04-01T00:00:00Z",
    updated_at: "2016-04-01T00:00:00Z",

    install_count: 3110,
    avg_rating: 3.7,
    rating_count: 52,
    is_featured: false,
    is_editors_pick: false,
    min_android_version: "6.0",
    size_mb: 4.1,
    sha256_checksum: "2acf86c8dccad0726fca9902285b15ed63c1efb7d5dbe4522caba1387bb82e20",
    signing_certificate_fingerprint: "BF:91:10:B6:CF:84:9F:BC:BF:1C:98:53:93:24:79:BD:2B:28:3A:FB:C6:2F:8F:F0:E7:71:40:F7:D1:18:52:A5",
    play_store_rejection_reason: "Themes system UI components, which Play Store policy restricts for non-OEM apps.",
    permissions: ["WRITE_SETTINGS"],
    screenshots: ["/mock/screenshots/enhancement-1.png"],
    changelog: "Initial release for CM13.",
  },
  {
    id: "11",
    slug: "fira-font",
    name: "Fira Font",
    summary: "Mozilla Fira font for the Cyanogenmod font engine",
    description:
      "Packages Mozilla's Fira Sans typeface for use with the CyanogenMod system font engine, replacing the default system typeface everywhere it's rendered.",
    site: "https://mozilla.github.io/Fira/",
    source: "https://github.com/mozilla/Fira",
    tracker: "https://github.com/mozilla/Fira/issues",
    donate: null,
    icon: "fira-font.png",
    primary_color: "#0060DF",
    secondary_color: "#AAD4FF",
    tertiary_color: "#003EAA",
    apk: "org.mozilla.fira.theme_10.apk",
    version: "1.0",
    license: "OFL-1.1",
    is_published: true,
    category: "theming",
    created_at: "2013-11-11T00:00:00Z",
    updated_at: "2014-02-04T00:00:00Z",

    install_count: 12980,
    avg_rating: 4.4,
    rating_count: 298,
    is_featured: false,
    is_editors_pick: true,
    min_android_version: "4.1",
    size_mb: 2.0,
    sha256_checksum: "d54ceeaa906cef6ec7f04178e2d6872c0b053506d402d584a1666da39298c22a",
    signing_certificate_fingerprint: "84:33:9B:AA:5F:35:34:CF:01:ED:A8:9B:59:06:74:EB:8D:C9:43:8D:90:53:C2:56:4A:2B:91:CA:2E:4E:D0:DF",
    play_store_rejection_reason: null,
    permissions: [],
    screenshots: ["/mock/screenshots/fira-font-1.png"],
    changelog: "Updated to Fira Sans 4.2 metrics.",
  },
  {
    id: "12",
    slug: "icecons",
    name: "ICEcons",
    summary: "OSS white icon pack",
    description:
      "An open-source, all-white icon pack with a consistent 2px stroke weight, covering the most commonly used FOSS and stock AOSP apps.",
    site: null,
    source: "https://github.com/icecons/icecons",
    tracker: null,
    donate: null,
    icon: "icecons.png",
    primary_color: "#FFFFFF",
    secondary_color: "#F5F5F5",
    tertiary_color: "#9E9E9E",
    apk: "com.icecons.iconpack_14.apk",
    version: "1.4",
    license: "CC-BY-SA-4.0",
    is_published: true,
    category: "theming",
    created_at: "2015-09-17T00:00:00Z",
    updated_at: "2016-05-25T00:00:00Z",

    install_count: 7650,
    avg_rating: 4.3,
    rating_count: 176,
    is_featured: false,
    is_editors_pick: false,
    min_android_version: "4.1",
    size_mb: 8.2,
    sha256_checksum: "781335b1eebf02403e539797dfb28737b55715233175df09f6e17e6bd0cf94d2",
    signing_certificate_fingerprint: "8A:DB:22:DC:52:2D:68:11:7E:15:F8:20:72:2B:8E:C9:74:D1:DA:9D:F8:42:92:A7:B9:94:35:7E:25:87:05:B5",
    play_store_rejection_reason: null,
    permissions: [],
    screenshots: ["/mock/screenshots/icecons-1.png"],
    changelog: "Added 40 new app icons.",
  },
  {
    id: "13",
    slug: "greyscale",
    name: "Greyscale",
    summary: "A simple AOSP-like theme for CM",
    description:
      "A simple, AOSP-like grayscale theme for CyanogenMod, aiming to stay as close as possible to stock Android's look with none of the vendor color accents.",
    site: null,
    source: "https://github.com/greyscale-theme/greyscale",
    tracker: "https://github.com/greyscale-theme/greyscale/issues",
    donate: null,
    icon: "greyscale.png",
    primary_color: "#212121",
    secondary_color: "#757575",
    tertiary_color: "#000000",
    apk: "com.greyscale.theme_09.apk",
    version: "0.9",
    license: "GPL-3.0",
    is_published: true,
    category: "theming",
    created_at: "2016-06-06T00:00:00Z",
    updated_at: "2016-09-28T00:00:00Z",

    install_count: 4980,
    avg_rating: 4.0,
    rating_count: 73,
    is_featured: false,
    is_editors_pick: false,
    min_android_version: "5.0",
    size_mb: 3.5,
    sha256_checksum: "0a4db68e89bde58a72d5807e67d26a054df60b556748627aadb79951ce5d3a87",
    signing_certificate_fingerprint: "35:04:C0:59:C5:C1:42:06:20:35:4A:D2:E1:B9:3E:07:EC:8A:4E:AE:2D:80:4F:15:FB:8D:C1:B1:03:42:45:CB",
    play_store_rejection_reason: "Themes system UI components, which Play Store policy restricts for non-OEM apps.",
    permissions: ["WRITE_SETTINGS"],
    screenshots: ["/mock/screenshots/greyscale-1.png"],
    changelog: "Initial release.",
  },
];

/** Number of catalog apps per category, derived from `apps` — not hand-maintained. */
export function appCountByCategory(categorySlug: string): number {
  return apps.filter((app) => app.category === categorySlug).length;
}
