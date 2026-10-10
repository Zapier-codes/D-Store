import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAgeFilter,
  applySearchView,
  contentClass,
  isDefaultSearchView,
  parseAgeFilter,
  parseMinStars,
  parseSearchSort,
  searchViewQuery,
} from "../lib/search-view";
import type { App } from "../lib/mock-data";

// Track k: the web port of Storeapp's `applySearchView`. Written to lint/run under the repo's
// `node:test` suite; the pure functions are dependency-free.

function app(slug: string, over: Partial<App> = {}): App {
  return {
    slug,
    name: slug,
    avg_rating: 0,
    rating_count: 0,
    updated_at: "2026-01-01T00:00:00Z",
    size_mb: 1,
    ...over,
  } as unknown as App;
}

const slugs = (apps: App[]) => apps.map((a) => a.slug);

test("parseSearchSort accepts the offered keys, case-insensitively, and defaults to relevance", () => {
  assert.equal(parseSearchSort("stars"), "stars");
  assert.equal(parseSearchSort("Stars"), "stars");
  assert.equal(parseSearchSort("updated"), "updated");
  assert.equal(parseSearchSort("name"), "name");
  assert.equal(parseSearchSort("size"), "size");
  assert.equal(parseSearchSort("relevance"), "relevance");
  // Anything else, or a non-string the framework might hand over, is the default view.
  assert.equal(parseSearchSort("nonsense"), "relevance");
  assert.equal(parseSearchSort(""), "relevance");
  assert.equal(parseSearchSort(undefined), "relevance");
  assert.equal(parseSearchSort(["stars", "name"]), "relevance");
});

test("parseMinStars accepts only the offered buckets and defaults to any (0)", () => {
  assert.equal(parseMinStars("0"), 0);
  assert.equal(parseMinStars("3"), 3);
  assert.equal(parseMinStars("4"), 4);
  assert.equal(parseMinStars("4.5"), 4.5);
  // A value that is not one of the options is "any", never a phantom filter.
  assert.equal(parseMinStars("3.7"), 0);
  assert.equal(parseMinStars("5"), 0);
  assert.equal(parseMinStars(undefined), 0);
  assert.equal(parseMinStars(""), 0);
});

test("isDefaultSearchView is true only for relevance with no rating filter", () => {
  assert.equal(isDefaultSearchView("relevance", 0), true);
  assert.equal(isDefaultSearchView("stars", 0), false);
  assert.equal(isDefaultSearchView("relevance", 4), false);
});

test("applySearchView does not mutate the input list", () => {
  const input = [app("a", { name: "B" }), app("b", { name: "A" })];
  const before = slugs(input);
  applySearchView(input, "name", 0);
  assert.deepEqual(slugs(input), before, "the caller's list is untouched");
});

test("applySearchView: relevance keeps the catalogue order, even with no filter", () => {
  const input = [app("c"), app("a"), app("b")];
  assert.deepEqual(slugs(applySearchView(input, "relevance", 0)), ["c", "a", "b"]);
});

test("applySearchView: stars sorts by average rating, highest first", () => {
  const input = [app("low", { avg_rating: 3.1 }), app("high", { avg_rating: 4.9 }), app("mid", { avg_rating: 4.2 })];
  assert.deepEqual(slugs(applySearchView(input, "stars", 0)), ["high", "mid", "low"]);
});

test("applySearchView: updated sorts by update date, newest first", () => {
  const input = [app("old", { updated_at: "2025-01-01T00:00:00Z" }), app("new", { updated_at: "2026-09-01T00:00:00Z" })];
  assert.deepEqual(slugs(applySearchView(input, "updated", 0)), ["new", "old"]);
});

test("applySearchView: name sorts case-insensitively by name", () => {
  const input = [app("x", { name: "banana" }), app("y", { name: "Apple" }), app("z", { name: "cherry" })];
  assert.deepEqual(slugs(applySearchView(input, "name", 0)), ["y", "x", "z"]);
});

test("applySearchView: size sorts by size_mb, largest first", () => {
  const input = [app("small", { size_mb: 2 }), app("large", { size_mb: 80 }), app("mid", { size_mb: 20 })];
  assert.deepEqual(slugs(applySearchView(input, "size", 0)), ["large", "mid", "small"]);
});

test("applySearchView: minStars drops apps below the threshold, then sorts", () => {
  const input = [app("a", { avg_rating: 2.9 }), app("b", { avg_rating: 4.4 }), app("c", { avg_rating: 3.5 })];
  assert.deepEqual(slugs(applySearchView(input, "stars", 3)), ["b", "c"]);
  assert.deepEqual(slugs(applySearchView(input, "stars", 4)), ["b"]);
  assert.deepEqual(slugs(applySearchView(input, "stars", 4.5)), []);
});

test("applySearchView: a filter with the default sort keeps the catalogue's order among survivors", () => {
  const input = [app("low", { avg_rating: 1 }), app("keep1", { avg_rating: 4 }), app("keep2", { avg_rating: 3 })];
  assert.deepEqual(slugs(applySearchView(input, "relevance", 3)), ["keep1", "keep2"]);
});

test("searchViewQuery carries the query and only the non-default view values", () => {
  assert.deepEqual(searchViewQuery("chat", "relevance", 0), { q: "chat" });
  assert.deepEqual(searchViewQuery("chat", "stars", 0), { q: "chat", sort: "stars" });
  assert.deepEqual(searchViewQuery("chat", "relevance", 4), { q: "chat", minStars: "4" });
  assert.deepEqual(searchViewQuery("chat", "size", 4.5), { q: "chat", sort: "size", minStars: "4.5" });
  // A blank query still yields the view, so a pager link never loses the sort.
  assert.deepEqual(searchViewQuery("", "name", 0), { sort: "name" });
});

// Card D-P7 — the age / content-rating filter.

test("contentClass places the common rating strings, and leaves anything it cannot place unrated", () => {
  assert.equal(contentClass("Everyone"), "everyone");
  assert.equal(contentClass("All ages"), "everyone");
  assert.equal(contentClass("Teen"), "teen");
  assert.equal(contentClass("Rated for 12+"), "teen");
  assert.equal(contentClass("Mature"), "mature");
  assert.equal(contentClass("Mature 17+"), "mature");
  assert.equal(contentClass("Adults only 18+"), "adults");
  assert.equal(contentClass("Unrated"), null);
  assert.equal(contentClass(""), null);
  assert.equal(contentClass(null), null);
  assert.equal(contentClass(undefined), null);
});

test("parseAgeFilter accepts the offered tokens and defaults to any", () => {
  assert.equal(parseAgeFilter("teen"), "teen");
  assert.equal(parseAgeFilter("Teen"), "teen");
  assert.equal(parseAgeFilter("adults"), "adults");
  assert.equal(parseAgeFilter("any"), "any");
  assert.equal(parseAgeFilter("nonsense"), "any");
  assert.equal(parseAgeFilter(undefined), "any");
});

test("applyAgeFilter keeps everything under any, narrows by class under a real one", () => {
  const apps = [
    app("kid", { content_rating: "Everyone" }),
    app("teen", { content_rating: "Teen" }),
    app("mature", { content_rating: "Mature 17+" }),
    app("adult", { content_rating: "Adults only 18+" }),
    // A value outside the typed vocabulary (a foreign source): still unrated, never guessed into a class.
    app("unrated", { content_rating: "Whatever" as unknown as App["content_rating"] }),
  ];
  assert.deepEqual(slugs(applyAgeFilter(apps, "any")), ["kid", "teen", "mature", "adult", "unrated"]);
  assert.deepEqual(slugs(applyAgeFilter(apps, "everyone")), ["kid"]);
  assert.deepEqual(slugs(applyAgeFilter(apps, "teen")), ["kid", "teen"]);
  assert.deepEqual(slugs(applyAgeFilter(apps, "mature")), ["kid", "teen", "mature"]);
  assert.deepEqual(slugs(applyAgeFilter(apps, "adults")), ["kid", "teen", "mature", "adult"]);
});

test("applyAgeFilter drops an app whose source said the rating was not provided", () => {
  const apps = [
    app("kid", { content_rating: "Everyone" }),
    app("blank", { content_rating: "Everyone", not_provided: ["content_rating"] }),
  ];
  assert.deepEqual(slugs(applyAgeFilter(apps, "everyone")), ["kid"]);
});

test("isDefaultSearchView accounts for the age filter too", () => {
  assert.equal(isDefaultSearchView("relevance", 0, "any"), true);
  assert.equal(isDefaultSearchView("relevance", 0, "teen"), false);
  assert.equal(isDefaultSearchView("stars", 0, "any"), false);
});

test("searchViewQuery carries the age token only when it is not the default", () => {
  assert.deepEqual(searchViewQuery("q", "relevance", 0, "any"), { q: "q" });
  assert.deepEqual(searchViewQuery("q", "stars", 4, "teen"), { q: "q", sort: "stars", minStars: "4", age: "teen" });
});
