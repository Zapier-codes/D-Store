import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLocaleFilter,
  badgesFor,
  daysSince,
  installsLabelFor,
  languageLabel,
  localeChoicesFor,
  normalizeLanguage,
  parseLocale,
  rolloutLabel,
  similarAppsFor,
  trailerUrlFor,
  youTubeId,
  UPDATED_BADGE_DAYS,
} from "../lib/play-ports";

// Web ports of Storeapp's PlayModels.kt derivation helpers. Card D-P1 (badges), D-P2 (installs),
// D-P3 (trailer), D-P4 (rail), D-P8 (locale), plus the Z-P1 rollout reader.

const NOW = Date.parse("2026-10-10T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

test("daysSince: whole days, and null for missing or unparseable input", () => {
  assert.equal(daysSince(daysAgo(5), NOW), 5);
  assert.equal(daysSince(null, NOW), null);
  assert.equal(daysSince(undefined, NOW), null);
  assert.equal(daysSince("not a date", NOW), null);
});

test("badgesFor: Updated only inside the window, Open source always", () => {
  assert.deepEqual(
    badgesFor({ updated_at: daysAgo(10) }, { now: NOW }).map((b) => b.id),
    ["updated", "open-source"],
  );
  assert.deepEqual(
    badgesFor({ updated_at: daysAgo(UPDATED_BADGE_DAYS + 1) }, { now: NOW }).map((b) => b.id),
    ["open-source"],
  );
});

test("badgesFor: Trending is the caller's signal, never guessed", () => {
  assert.deepEqual(
    badgesFor({ updated_at: daysAgo(400) }, { now: NOW, trending: true }).map((b) => b.id),
    ["trending", "open-source"],
  );
});

test("badgesFor: a future or unparseable date earns no Updated badge", () => {
  assert.deepEqual(badgesFor({ updated_at: daysAgo(-3) }, { now: NOW }).map((b) => b.id), ["open-source"]);
  assert.deepEqual(badgesFor({ updated_at: "nope" }, { now: NOW }).map((b) => b.id), ["open-source"]);
});

test("trailerUrlFor: picks the first YouTube link, else Vimeo, else nothing", () => {
  assert.equal(
    trailerUrlFor("see https://youtu.be/abcdefghijk for the demo"),
    "https://youtu.be/abcdefghijk",
  );
  assert.equal(
    trailerUrlFor("watch https://www.youtube.com/watch?v=abcdefghijk"),
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
  assert.equal(trailerUrlFor("clip at https://vimeo.com/12345678"), "https://vimeo.com/12345678");
  assert.equal(trailerUrlFor("no video here"), null);
  assert.equal(trailerUrlFor(null, undefined), null);
});

test("trailerUrlFor: YouTube wins over Vimeo when both appear", () => {
  assert.equal(
    trailerUrlFor("https://vimeo.com/12345678 then https://youtu.be/abcdefghijk"),
    "https://youtu.be/abcdefghijk",
  );
});

test("youTubeId: only for a YouTube trailer", () => {
  assert.equal(youTubeId("https://youtu.be/abcdefghijk"), "abcdefghijk");
  assert.equal(youTubeId("https://vimeo.com/12345678"), null);
  assert.equal(youTubeId(null), null);
});

const app = (over: Partial<Parameters<typeof similarAppsFor>[0]> & { slug: string }) => ({
  name: over.slug,
  description: "",
  category: "tools",
  source: "github",
  avg_rating: 0,
  icon: "icon.png",
  ...over,
});

test("similarAppsFor: same category outranks a lower-rated unrelated app", () => {
  const target = app({ slug: "target", name: "Photo editor", category: "photo", avg_rating: 4 });
  const pool = [
    app({ slug: "same-cat", name: "Photo editor", category: "photo", avg_rating: 3 }),
    app({ slug: "other", name: "Photo editor", category: "finance", avg_rating: 5, source: "aptoide" }),
  ];
  assert.deepEqual(similarAppsFor(target, pool).map((a) => a.slug), ["same-cat", "other"]);
});

test("similarAppsFor: only non-zero scores, target excluded, cap respected", () => {
  const target = app({ slug: "target", name: "Photo editor", description: "edit photos fast" });
  const unrelated = app({ slug: "unrelated", name: "Bank", description: "money" , category: "finance", source: "aptoide" });
  const pool = [target, unrelated, ...Array.from({ length: 20 }, (_, i) => app({ slug: `s${i}`, name: "Photo editor", description: "edit photos" }))];
  const out = similarAppsFor(target, pool);
  assert.equal(out.length, 8);
  assert.ok(!out.some((a) => a.slug === "target"));
  assert.ok(!out.some((a) => a.slug === "unrelated"));
});

test("similarAppsFor: skips a candidate with an empty icon but keeps one with no icon field", () => {
  const target = app({ slug: "target", name: "Photo editor", description: "edit photos fast" });
  const noIcon = app({ slug: "no-icon", name: "Photo editor", description: "edit photos", icon: "" });
  const undefinedIcon = app({ slug: "undef", name: "Photo editor", description: "edit photos" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (undefinedIcon as any).icon;
  const out = similarAppsFor(target, [noIcon, undefinedIcon]);
  assert.deepEqual(out.map((a) => a.slug), ["undef"]);
});

// ── Card D-P2: the installs label ────────────────────────────────────────────

test("installsLabelFor: a reported/carried-over figure wins, compacted with a +", () => {
  assert.equal(installsLabelFor({ origin: "zealot", install_count: 1234 }), "1.2K+ downloads");
  assert.equal(installsLabelFor({ origin: "zealot", base_stats: { downloads: 5_789_000 } }), "5.8M+ downloads");
  assert.equal(installsLabelFor({ origin: "zealot", install_count: 12 }), "12+ downloads");
});

test("installsLabelFor: with no downloads it falls back to the rating count, else nothing", () => {
  assert.equal(installsLabelFor({ origin: "zealot", rating_count: 4200 }), "4.2K ratings");
  assert.equal(installsLabelFor({ origin: "zealot" }), "");
  // A third-party app's own install_count is always 0 and its reported stats are not this figure.
  assert.equal(installsLabelFor({ origin: "aptoide", install_count: 0, rating_count: 90 }), "90 ratings");
});

// ── Card Z-P1: the staged-rollout reader ─────────────────────────────────────

test("rolloutLabel: says nothing when fully rolled out or absent, and the share while ramping", () => {
  assert.equal(rolloutLabel({ origin: "zealot", rollout_percentage: 100, rollout_status: "complete" }), null);
  assert.equal(rolloutLabel({ origin: "zealot" }), null);
  assert.equal(rolloutLabel({ origin: "zealot", rollout_percentage: 20, rollout_status: "active" }), "Rolling out to 20% of users");
  assert.equal(rolloutLabel({ origin: "zealot", rollout_percentage: 20, rollout_status: "halted" }), "Rollout paused");
  assert.equal(rolloutLabel({ origin: "zealot", rollout_percentage: 0, rollout_status: "active" }), "Rollout not started");
  // A third-party app never carries a rollout.
  assert.equal(rolloutLabel({ origin: "aptoide", rollout_percentage: 20, rollout_status: "active" }), null);
});

// ── Card D-P8: the locale / language preference ──────────────────────────────

test("normalizeLanguage / parseLocale: lower-cased, blank means any", () => {
  assert.equal(normalizeLanguage("EN"), "en");
  assert.equal(normalizeLanguage("  de "), "de");
  assert.equal(normalizeLanguage(""), null);
  assert.equal(normalizeLanguage(null), null);
  assert.equal(parseLocale("fr"), "fr");
  assert.equal(parseLocale(""), null);
  assert.equal(parseLocale(undefined), null);
});

test("languageLabel: a known code is named, an unknown one is uppercased", () => {
  assert.equal(languageLabel("de"), "German");
  assert.equal(languageLabel("zh-cn"), "Chinese (Simplified)");
  assert.equal(languageLabel("xx"), "XX");
});

test("localeChoicesFor: only languages actually present, sorted, any first", () => {
  const choices = localeChoicesFor([
    { language: "de" },
    { language: "en" },
    { language: null },
    { language: "de" },
  ]);
  assert.deepEqual(choices, [
    { value: "any", label: "Any language" },
    { value: "en", label: "English" },
    { value: "de", label: "German" },
  ]);
  assert.deepEqual(localeChoicesFor([]), [{ value: "any", label: "Any language" }]);
});

test("applyLocaleFilter: no preference keeps all, a real one keeps only its own and drops the unlabelled", () => {
  const apps = [{ language: "en" }, { language: "de" }, { language: null }, {}];
  assert.equal(applyLocaleFilter(apps, null).length, 4);
  assert.deepEqual(applyLocaleFilter(apps, "de"), [{ language: "de" }]);
  assert.deepEqual(applyLocaleFilter(apps, "EN"), apps.filter((a) => a.language === "en"));
  assert.equal(applyLocaleFilter(apps, "ja").length, 0);
});
