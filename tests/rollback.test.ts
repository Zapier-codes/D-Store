import { test } from "node:test";
import assert from "node:assert/strict";
import { decideRollback } from "../lib/rollback";
import { decideDownload, type VersionEntry } from "../lib/version-history";

// Leaf 5.c.x.zi.
const entry = (over: Partial<VersionEntry> = {}): VersionEntry => ({
  version_name: "1.0.0",
  changelog: null,
  size_mb: 5,
  rollout_percentage: 100,
  rollout_status: "complete",
  status: "available",
  download_url: "https://example.invalid/a.apk",
  permissions: [],
  ...over,
});
const list = (...over: Partial<VersionEntry>[]) => over.map((o, i) => entry({ version_name: `${3 - i}.0.0`, ...o }));
const INVALID = { offered: false, reason: "invalid" };

test("position 0 is the newest and is never a rollback target", () => {
  assert.deepEqual(decideRollback(list({}, {}), 0), { offered: false, reason: "newest" });
  // even when it is pulled: the newest-release banner covers that, not this
  assert.deepEqual(decideRollback(list({ status: "pulled" }, {}), 0), { offered: false, reason: "newest" });
});

test("an older, available, fully rolled-out release is offered, marked as a downgrade", () => {
  assert.deepEqual(decideRollback(list({}, {}, {}), 2), {
    offered: true,
    url: "https://example.invalid/a.apk",
    downgrade: true,
  });
});

test("each withheld reason from decideDownload passes through unchanged", () => {
  const cases: [Partial<VersionEntry>, string][] = [
    [{ status: "pulled" }, "pulled"],
    [{ status: "halted" }, "halted"],
    [{ rollout_status: "active", rollout_percentage: 30 }, "rolling_out"],
    [{ rollout_status: "halted", rollout_percentage: 100 }, "rolling_out"],
    [{ rollout_status: "complete", rollout_percentage: 99 }, "rolling_out"],
    [{ download_url: null }, "no_link"],
  ];
  for (const [over, reason] of cases) {
    const entries = list({}, over);
    assert.deepEqual(decideRollback(entries, 1), { offered: false, reason });
    assert.deepEqual(decideRollback(entries, 1), { offered: false, reason: (decideDownload(entries[1]) as { reason: string }).reason });
  }
});

test("the decideDownload order of reasons is kept (pulled beats halted beats rolling out beats no link)", () => {
  const all = { status: "pulled", rollout_status: "active", rollout_percentage: 10, download_url: null } as Partial<VersionEntry>;
  assert.deepEqual(decideRollback(list({}, all), 1), { offered: false, reason: "pulled" });
  assert.deepEqual(decideRollback(list({}, { ...all, status: "halted" }), 1), { offered: false, reason: "halted" });
  assert.deepEqual(decideRollback(list({}, { ...all, status: "available" }), 1), { offered: false, reason: "rolling_out" });
});

test("a bad index is invalid, never a throw", () => {
  const entries = list({}, {});
  for (const bad of [-1, 2, 99, 0.5, NaN, Infinity, -Infinity, "1", null, undefined, {}, [], true]) {
    assert.deepEqual(decideRollback(entries, bad as unknown as number), INVALID, String(bad));
  }
  assert.deepEqual(decideRollback([], 0), INVALID);
});

test("a non-array of entries is invalid, never a throw", () => {
  for (const bad of [undefined, null, NaN, 0, "1.0", true, {}, () => 1, Symbol("x")]) {
    assert.deepEqual(decideRollback(bad as unknown as VersionEntry[], 1), INVALID);
  }
});

test("a malformed entry is invalid, never a throw", () => {
  const holes = [entry(), null, undefined, 5, "x", [], () => 1] as unknown as VersionEntry[];
  for (let i = 1; i < holes.length; i++) assert.deepEqual(decideRollback(holes, i), INVALID, String(i));
  const throwing = new Proxy({}, { get() { throw new Error("boom"); } }) as unknown as VersionEntry;
  assert.deepEqual(decideRollback([entry(), throwing], 1), INVALID);
});

test("an entry with missing fields is withheld, not offered", () => {
  const bare = {} as unknown as VersionEntry;
  const out = decideRollback([entry(), bare], 1);
  assert.equal(out.offered, false);
});

test("an offer carries only the checked url", () => {
  const out = decideRollback(list({}, { download_url: "https://example.invalid/old.apk" }), 1);
  assert.deepEqual(out, { offered: true, url: "https://example.invalid/old.apk", downgrade: true });
});

test("the input is not mutated", () => {
  const entries = list({}, { status: "pulled" }, {});
  const before = JSON.stringify(entries);
  decideRollback(entries, 1);
  decideRollback(entries, 2);
  decideRollback(entries, 0);
  assert.equal(JSON.stringify(entries), before);
  const frozen = Object.freeze(entries.map((e) => Object.freeze({ ...e })));
  assert.equal(decideRollback(frozen, 2).offered, true);
});
