import assert from "node:assert/strict";
import test from "node:test";
import { listTaxonomyCategories } from "../lib/taxonomy";
import { categoryIconShapes, hasCategoryIcon, FALLBACK_DRAWING, MATERIAL_TO_DRAWING } from "../lib/category-icons";

test("every vocabulary category has its own drawing (none falls back to the generic icon)", () => {
  const missing = listTaxonomyCategories().filter((c) => c.icon !== "category" && !hasCategoryIcon(c.icon));
  assert.deepEqual(missing.map((c) => `${c.app_type}:${c.slug}:${c.icon}`), []);
});

test("unknown, empty and non-string names draw the generic icon, never nothing", () => {
  const generic = categoryIconShapes("category");
  for (const bad of ["", "no_such_icon", undefined, null, 5, "__proto__", "constructor"]) {
    assert.equal(categoryIconShapes(bad), generic);
    assert.ok(generic.length > 0);
  }
  assert.equal(MATERIAL_TO_DRAWING[FALLBACK_DRAWING], undefined);
});
