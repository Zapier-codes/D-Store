import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_PLAN, buildPlan, classifyApp, normalizeVersion, type PlanApp } from "../lib/push-plan";

// Leaf 5.d.iv.zi.
function app(over: Partial<PlanApp> = {}): PlanApp {
  return { slug: "a", name: "A", version: "1.0", rollout_percentage: 100, rollout_status: "complete", ...over };
}

test("normalizeVersion: trims, and treats blank or non-strings as absent", () => {
  assert.equal(normalizeVersion(" 1.2 "), "1.2");
  assert.equal(normalizeVersion("   "), null);
  assert.equal(normalizeVersion(""), null);
  for (const v of [undefined, null, 1, {}, []]) assert.equal(normalizeVersion(v), null);
});

test("classifyApp: no baseline is a baseline when fully rolled out, held back otherwise", () => {
  assert.equal(classifyApp(app(), undefined), "baseline");
  assert.equal(classifyApp(app({ rollout_status: "active", rollout_percentage: 20 }), undefined), "held_back");
  assert.equal(classifyApp(app(), "   "), "baseline"); // a blank baseline counts as absent
});

test("classifyApp: same version is unchanged, a new fully rolled-out version is notify", () => {
  assert.equal(classifyApp(app(), "1.0"), "unchanged");
  assert.equal(classifyApp(app(), "0.9"), "notify");
  assert.equal(classifyApp(app({ version: " 1.0 " }), "1.0"), "unchanged");
});

test("classifyApp: a halted, partial or non-100 rollout is held back, never notify", () => {
  assert.equal(classifyApp(app({ rollout_status: "halted" }), "0.9"), "held_back");
  assert.equal(classifyApp(app({ rollout_status: "active", rollout_percentage: 100 }), "0.9"), "held_back");
  assert.equal(classifyApp(app({ rollout_percentage: 50 }), "0.9"), "held_back");
});

test("classifyApp: malformed input is unchanged and never throws", () => {
  const a = app();
  assert.equal(classifyApp(null as unknown as PlanApp, "1"), "unchanged");
  assert.equal(classifyApp(undefined as unknown as PlanApp, "1"), "unchanged");
  assert.equal(classifyApp({ ...a, slug: "" }, "0.9"), "unchanged");
  assert.equal(classifyApp({ ...a, slug: 5 as unknown as string }, "0.9"), "unchanged");
  assert.equal(classifyApp({ ...a, name: 5 as unknown as string }, "0.9"), "unchanged");
  assert.equal(classifyApp({ ...a, version: 5 as unknown as string }, "0.9"), "unchanged");
  assert.equal(classifyApp({ ...a, version: "  " }, "0.9"), "unchanged");
  assert.equal(classifyApp(a, 5 as unknown as string), "unchanged"); // present but not a string: refuse to guess
});

test("buildPlan: sorts, filters to subscribed slugs and counts every decision", () => {
  const apps = [
    app({ slug: "d", name: "D", rollout_status: "halted" }), // held back
    app({ slug: "c", name: "C", version: "1.0" }), // unchanged
    app({ slug: "b", name: "B" }), // no baseline -> baseline
    app({ slug: "a", name: "A", version: "2.0" }), // new version -> notify
    app({ slug: "x", name: "X", version: "9.9" }), // not subscribed
  ];
  const baselines = new Map([
    ["a", "1.0"],
    ["c", "1.0"],
    ["d", "0.5"],
  ]);
  const plan = buildPlan(apps, baselines, ["a", "b", "c", "d", "not-in-catalog"]);
  assert.deepEqual(plan.notify, [{ slug: "a", name: "A", version: "2.0" }]);
  assert.deepEqual(plan.baseline, [{ slug: "b", version: "1.0" }]);
  assert.deepEqual(plan.counts, { considered: 4, notify: 1, baseline: 1, unchanged: 1, held_back: 1, deferred: 0 });
});

test("buildPlan: the same input gives the same plan whatever the input order", () => {
  const apps = ["c", "a", "b"].map((slug) => app({ slug, name: slug.toUpperCase() }));
  const forward = buildPlan(apps, new Map(), ["a", "b", "c"]);
  const backward = buildPlan([...apps].reverse(), new Map(), ["c", "b", "a"]);
  assert.deepEqual(forward, backward);
  assert.deepEqual(forward.baseline.map((e) => e.slug), ["a", "b", "c"]);
});

test("buildPlan: caps notify plus baseline at MAX_PLAN and counts the rest as deferred", () => {
  const apps = Array.from({ length: MAX_PLAN + 5 }, (_, i) => app({ slug: `app-${String(i).padStart(3, "0")}`, version: "2.0" }));
  const baselines = new Map(apps.map((a) => [a.slug, "1.0"] as [string, string]));
  const plan = buildPlan(apps, baselines, apps.map((a) => a.slug));
  assert.equal(plan.notify.length, MAX_PLAN);
  assert.equal(plan.counts.deferred, 5);
  assert.equal(plan.counts.considered, MAX_PLAN + 5);
});

test("buildPlan: hostile arguments give an empty plan and never throw", () => {
  const empty = { notify: [], baseline: [], counts: { considered: 0, notify: 0, baseline: 0, unchanged: 0, held_back: 0, deferred: 0 } };
  assert.deepEqual(buildPlan(null as never, new Map(), ["a"]), empty);
  assert.deepEqual(buildPlan([app()], {} as never, ["a"]), empty);
  assert.deepEqual(buildPlan([app()], new Map(), null as never), empty);
  assert.doesNotThrow(() => buildPlan([null, undefined, 5, "x"] as never, new Map(), ["a"]));
});
