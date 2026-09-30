import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_TO_PLAY,
  PLAY_APP_CATEGORIES,
  PLAY_GAME_GENRES,
  UNCATEGORIZED,
  affinityCategory,
  checkCategory,
  isAppType,
  taxonomySlug,
  toPlay,
} from "../lib/taxonomy";

// Leaf 5.d.iv.zi.
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

test("taxonomySlug: lower-cases, spells & as 'and', and collapses everything else to single hyphens", () => {
  assert.equal(taxonomySlug("Art & Design"), "art-and-design");
  assert.equal(taxonomySlug("  Tools "), "tools");
  assert.equal(taxonomySlug("Video Players & Editors"), "video-players-and-editors");
});

test("the vocabularies have unique, well-formed slugs", () => {
  for (const list of [PLAY_APP_CATEGORIES, PLAY_GAME_GENRES]) {
    const slugs = list.map((e) => e.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const slug of slugs) assert.match(slug, SLUG);
  }
});

test("every LEGACY_TO_PLAY target is Uncategorized or a real category of its own app_type", () => {
  for (const [legacy, pair] of Object.entries(LEGACY_TO_PLAY)) {
    const valid = pair.category === UNCATEGORIZED.slug || checkCategory(pair.app_type, pair.category).known;
    assert.ok(valid, `${legacy} -> ${pair.app_type}/${pair.category}`);
  }
});

test("isAppType and checkCategory", () => {
  assert.equal(isAppType("app"), true);
  assert.equal(isAppType("game"), true);
  assert.equal(isAppType("tool"), false);
  assert.equal(isAppType(undefined), false);
  assert.equal(checkCategory("app", "tools").known, true);
  assert.equal(checkCategory("game", "tools").known, false);
  assert.equal(checkCategory("bogus", "tools").known, false);
  assert.equal(checkCategory("app", 5).known, false);
});

test("toPlay: a vocabulary slug is kept, and the app_type is found when not given", () => {
  assert.deepEqual(toPlay("tools"), { app_type: "app", category: "tools", via: "vocabulary" });
  assert.deepEqual(toPlay("puzzle"), { app_type: "game", category: "puzzle", via: "vocabulary" });
});

test("toPlay: a legacy slug is mapped, an unknown one is Uncategorized", () => {
  assert.deepEqual(toPlay("system"), { app_type: "app", category: "tools", via: "legacy" });
  assert.deepEqual(toPlay("games"), { app_type: "game", category: UNCATEGORIZED.slug, via: "legacy" });
  assert.deepEqual(toPlay("nonsense"), { app_type: "app", category: UNCATEGORIZED.slug, via: "unknown" });
  assert.deepEqual(toPlay("nonsense", "game"), { app_type: "game", category: UNCATEGORIZED.slug, via: "unknown" });
});

test("toPlay: non-strings and object-prototype names are unknown and never throw", () => {
  for (const input of [undefined, null, 5, {}, [], "", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
    assert.deepEqual(toPlay(input), { app_type: "app", category: UNCATEGORIZED.slug, via: "unknown" }, String(input));
  }
});

test("affinityCategory: null for Uncategorized, the category otherwise", () => {
  assert.equal(affinityCategory("tools"), "tools");
  assert.equal(affinityCategory("system"), "tools");
  assert.equal(affinityCategory("nonsense"), null);
  assert.equal(affinityCategory(undefined), null);
});
