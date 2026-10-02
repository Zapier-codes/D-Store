import { test } from "node:test";
import assert from "node:assert/strict";
import { APP_PRIORITY, GAME_PRIORITY, MAX_KEYWORDS, categoryFromKeywords } from "../lib/taxonomy-keywords";
import { PLAY_APP_CATEGORIES, PLAY_GAME_GENRES, checkCategory } from "../lib/taxonomy";

// Leaf 5.l.viii.zi. Written, NOT run (standing instruction: no tests or builds).

test("every priority entry is a real Play slug, listed once", () => {
  assert.equal(new Set(APP_PRIORITY).size, APP_PRIORITY.length);
  assert.equal(new Set(GAME_PRIORITY).size, GAME_PRIORITY.length);
  for (const slug of APP_PRIORITY) assert.equal(checkCategory("app", slug).known, true, slug);
  for (const slug of GAME_PRIORITY) assert.equal(checkCategory("game", slug).known, true, slug);
  assert.equal(APP_PRIORITY.length, PLAY_APP_CATEGORIES.length - 2); // no keyword for Libraries & Demo or House & Home
  assert.equal(GAME_PRIORITY.length, PLAY_GAME_GENRES.length);
});

test("a single category word maps to its app category", () => {
  assert.deepEqual(categoryFromKeywords(["photography"]), { app_type: "app", category: "photography" });
  assert.deepEqual(categoryFromKeywords(["Tools"]), { app_type: "app", category: "tools" });
  assert.deepEqual(categoryFromKeywords([" Health "]), { app_type: "app", category: "health-and-fitness" });
  assert.deepEqual(categoryFromKeywords(["video"]), { app_type: "app", category: "video-players-and-editors" });
});

test("the answer does not depend on keyword order or repeats", () => {
  const a = categoryFromKeywords(["google", "android", "tools", "communication", "social"]);
  const b = categoryFromKeywords(["social", "communication", "tools", "android", "google", "social"]);
  assert.deepEqual(a, b);
  assert.deepEqual(a, { app_type: "app", category: "communication" });
});

test("specific beats generic: tools and entertainment lose to a specific category", () => {
  assert.equal(categoryFromKeywords(["tools", "finance"])?.category, "finance");
  assert.equal(categoryFromKeywords(["entertainment", "video", "tools"])?.category, "video-players-and-editors");
  assert.equal(categoryFromKeywords(["entertainment", "tools"])?.category, "entertainment");
});

test("no match, or words that are not category words, is null", () => {
  assert.equal(categoryFromKeywords([]), null);
  assert.equal(categoryFromKeywords(["google", "android", "apps", "free"]), null);
  assert.equal(categoryFromKeywords(["toolsmith", "photographer"]), null); // exact word only
});

test("an unambiguous genre word makes a game", () => {
  assert.deepEqual(categoryFromKeywords(["puzzle", "free"]), { app_type: "game", category: "puzzle" });
  assert.deepEqual(categoryFromKeywords(["casual", "arcade"]), { app_type: "game", category: "arcade" });
  assert.deepEqual(categoryFromKeywords(["RPG"]), { app_type: "game", category: "role-playing" });
  assert.deepEqual(categoryFromKeywords(["role playing"]), { app_type: "game", category: "role-playing" });
});

test("an ordinary app word is a game genre only with a game signal", () => {
  assert.deepEqual(categoryFromKeywords(["music", "audio"]), { app_type: "app", category: "music-and-audio" });
  assert.deepEqual(categoryFromKeywords(["action", "camera"]), null);
  assert.deepEqual(categoryFromKeywords(["music", "game"]), { app_type: "game", category: "music" });
  assert.deepEqual(categoryFromKeywords(["games", "sports"]), { app_type: "game", category: "sports" });
});

test("a game signal with no genre is null, not an app shelf", () => {
  assert.equal(categoryFromKeywords(["game", "entertainment"]), null);
  assert.equal(categoryFromKeywords(["games", "google", "tools"]), null);
});

test("a game word wins over an app word", () => {
  assert.deepEqual(categoryFromKeywords(["entertainment", "tools", "racing"]), { app_type: "game", category: "racing" });
});

test("hostile input never throws", () => {
  for (const bad of [undefined, null, 0, "tools", {}, { length: 3 }, [null, 1, {}, []], [""], ["   "], ["\u0000"]]) {
    assert.doesNotThrow(() => categoryFromKeywords(bad));
  }
  assert.equal(categoryFromKeywords("tools"), null);
  assert.deepEqual(categoryFromKeywords([null, 5, "tools"]), { app_type: "app", category: "tools" });
  assert.deepEqual(categoryFromKeywords(["__proto__", "constructor", "toString", "tools"]), { app_type: "app", category: "tools" });
});

test("only the first MAX_KEYWORDS entries are read", () => {
  const filler = Array.from({ length: MAX_KEYWORDS }, (_, i) => `filler${i}`);
  assert.equal(categoryFromKeywords([...filler, "tools"]), null);
  assert.deepEqual(categoryFromKeywords([...filler.slice(1), "tools"]), { app_type: "app", category: "tools" });
});

test("a very long keyword is cut, not matched", () => {
  assert.equal(categoryFromKeywords(["tools" + "x".repeat(500)]), null);
});
