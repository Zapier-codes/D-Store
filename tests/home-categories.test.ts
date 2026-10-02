import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_ROWS_MAX, type CategoryRowData } from "../lib/catalog-category-rows";
import { HOME_CATEGORY_ROWS, HOME_CATEGORY_ROW_SIZE, toHomeCategoryRows } from "../lib/home-categories";
import { findTaxonomyCategory } from "../lib/taxonomy";
import type { App } from "../lib/mock-data";

// Leaf 5.l.ix.zo. Written, not run (standing operator instruction: no tests, builds or tsc).
const app = (slug: string) => ({ slug }) as unknown as App;

test("the home list is within the read bound, has no repeats and only known, listed categories", () => {
  assert.ok(HOME_CATEGORY_ROWS.length > 0 && HOME_CATEGORY_ROWS.length <= CATEGORY_ROWS_MAX);
  assert.ok(Number.isInteger(HOME_CATEGORY_ROW_SIZE) && HOME_CATEGORY_ROW_SIZE > 0);
  const keys = HOME_CATEGORY_ROWS.map((s) => `${s.appType}/${s.category}`);
  assert.equal(new Set(keys).size, keys.length);
  for (const s of HOME_CATEGORY_ROWS) {
    assert.ok(findTaxonomyCategory(s.appType, s.category), `${s.appType}/${s.category} is in the vocabulary`);
    assert.notEqual(s.category, "uncategorized");
  }
});

test("toHomeCategoryRows: drops empty rows, keeps order, titles games, links the category page", () => {
  const rows: CategoryRowData[] = [
    { appType: "app", category: "tools", apps: [app("a")] },
    { appType: "app", category: "photography", apps: [] },
    { appType: "game", category: "casual", apps: [app("b"), app("c")] },
    { appType: "game", category: "sports", apps: [app("d")] },
    { appType: "app", category: "sports", apps: [app("e")] },
  ];
  const out = toHomeCategoryRows(rows);
  assert.deepEqual(
    out.map((r) => [r.title, r.href, r.apps.length]),
    [
      ["Tools", "/categories/app/tools", 1],
      ["Casual games", "/categories/game/casual", 2],
      ["Sports games", "/categories/game/sports", 1],
      ["Sports", "/categories/app/sports", 1],
    ]
  );
  assert.ok(out.every((r) => r.icon.length > 0));
});

test("toHomeCategoryRows: unknown pairs, uncategorized, and bad input give no row and never throw", () => {
  assert.deepEqual(toHomeCategoryRows(null), []);
  assert.deepEqual(toHomeCategoryRows(undefined), []);
  assert.deepEqual(toHomeCategoryRows([]), []);
  const odd = [
    { appType: "app", category: "uncategorized", apps: [app("a")] },
    { appType: "app", category: "no-such-shelf", apps: [app("a")] },
    null,
    { appType: "app", category: "tools", apps: "x" },
  ] as unknown as CategoryRowData[];
  assert.deepEqual(toHomeCategoryRows(odd), []);
});
