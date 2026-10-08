import assert from "node:assert/strict";
import test from "node:test";
import { HERO_MAX, selectHeroApps } from "../lib/hero";
import { HOME_CATEGORY_ROW_SIZE, leadWithFirstParty } from "../lib/home-categories";
import type { CategoryRowData } from "../lib/catalog-category-rows";
import type { App } from "../lib/mock-data";

// Operator-directed, 2026-10-08: the hero is featured first-party apps only (max 10), and first-party
// apps lead every home category row. Pure functions, no I/O.

function app(slug: string, over: Partial<App> = {}): App {
  return {
    slug,
    name: slug,
    origin: "zealot",
    is_featured: true,
    app_type: "app",
    category: "tools",
    install_count: 0,
    ...over,
  } as App;
}

test("hero keeps only first-party apps flagged featured", () => {
  const out = selectHeroApps([
    app("a"),
    app("b", { is_featured: false }),
    app("c", { origin: "aptoide" as App["origin"] }),
    app("d", { origin: "aptoide" as App["origin"], is_featured: true }),
    app("e"),
  ]);
  assert.deepEqual(out.map((x) => x.slug), ["a", "e"]);
});

test("hero carries at most ten cards, in the given order", () => {
  const many = Array.from({ length: 14 }, (_, i) => app(`app-${i}`));
  const out = selectHeroApps(many);
  assert.equal(out.length, HERO_MAX);
  assert.equal(HERO_MAX, 10);
  assert.deepEqual(out.map((x) => x.slug), many.slice(0, 10).map((x) => x.slug));
});

test("hero never exceeds ten even when asked for more, and a repeated slug counts once", () => {
  const many = Array.from({ length: 12 }, (_, i) => app(`app-${i}`));
  assert.equal(selectHeroApps(many, 50).length, 10);
  assert.equal(selectHeroApps(many, 3).length, 3);
  assert.equal(selectHeroApps([app("x"), app("x")]).length, 1);
});

test("hero is empty, not a fallback, when nothing first-party is featured", () => {
  assert.deepEqual(selectHeroApps([app("a", { is_featured: false })]), []);
  assert.deepEqual(selectHeroApps([]), []);
  assert.deepEqual(selectHeroApps(null), []);
  assert.deepEqual(selectHeroApps(undefined), []);
});

const third = (slug: string, over: Partial<App> = {}) => app(slug, { origin: "aptoide" as App["origin"], is_featured: false, ...over });
const specs = [
  { appType: "app" as const, category: "tools" },
  { appType: "app" as const, category: "social" },
];

test("category rows lead with that category's first-party apps, third-party fills the rest", () => {
  const rows: CategoryRowData[] = [
    { appType: "app", category: "tools", apps: [third("t1"), third("t2"), third("t3"), third("t4"), third("t5"), third("t6")] },
    { appType: "app", category: "social", apps: [third("s1")] },
  ];
  const out = leadWithFirstParty(rows, [app("mine-a"), app("mine-b", { category: "social" })], specs);
  assert.deepEqual(out[0].apps.map((x) => x.slug), ["mine-a", "t1", "t2", "t3", "t4", "t5"]);
  assert.equal(out[0].apps.length, HOME_CATEGORY_ROW_SIZE);
  assert.deepEqual(out[1].apps.map((x) => x.slug), ["mine-b", "s1"]);
});

test("a first-party app of another category or a third-party app does not lead a row", () => {
  const out = leadWithFirstParty(null, [app("x", { category: "music-and-audio" }), third("y")], specs);
  assert.deepEqual(out.map((r) => r.apps.length), [0, 0]);
});

test("with the database unreadable the rows are the first-party apps alone", () => {
  const out = leadWithFirstParty(null, [app("mine")], specs);
  assert.deepEqual(out[0].apps.map((x) => x.slug), ["mine"]);
  assert.deepEqual(out[1].apps, []);
});

test("first-party apps in a category are ordered by downloads, then slug", () => {
  const out = leadWithFirstParty([], [app("b", { install_count: 5 }), app("a", { install_count: 5 }), app("c", { install_count: 9 })], specs);
  assert.deepEqual(out[0].apps.map((x) => x.slug), ["c", "a", "b"]);
});
