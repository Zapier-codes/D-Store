import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_SHARDS,
  SNAPSHOT_FILE,
  SNAPSHOT_META_FILE,
  SNAPSHOT_SHARD_LIMIT_BYTES,
  buildSnapshotMeta,
  byteLength,
  invalidReason,
  isShardFileName,
  loadSnapshotFrom,
  mergeSnapshot,
  parseSnapshotMeta,
  parseStamp,
  planShards,
  refreshDecision,
  serializeApp,
  serializeShard,
  shardFileName,
  shardIndexOf,
} from "../lib/aptoide-snapshot";
import { fsReadText, readSnapshotFiles, writeSnapshotFiles } from "../lib/aptoide-snapshot-io";

// Leaf 5.h.x.zo.
const real: Record<string, unknown>[] = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/aptoide-snapshot-12.json"), "utf8"));
const app = (pkg: string, updated: string | null, extra: Record<string, unknown> = {}) => ({
  package: pkg,
  name: pkg,
  file: { filesize: 1000 },
  ...(updated === null ? {} : { updated }),
  ...extra,
});
const memory = (files: Record<string, string>) => async (name: string) => (name in files ? files[name] : null);

// --- shard names ---

test("shard names: index 0 is the legacy name, n is n+1, and only those names are shard names", () => {
  assert.equal(shardFileName(0), "aptoide-snapshot.json");
  assert.equal(shardFileName(1), "aptoide-snapshot.2.json");
  assert.equal(shardFileName(MAX_SHARDS - 1), `aptoide-snapshot.${MAX_SHARDS}.json`);
  assert.throws(() => shardFileName(-1), RangeError);
  assert.throws(() => shardFileName(1.5), RangeError);
  assert.throws(() => shardFileName(MAX_SHARDS), RangeError);
  for (let i = 0; i < MAX_SHARDS; i += 1) assert.equal(shardIndexOf(shardFileName(i)), i);
});

test("isShardFileName: refuses the header, paths, padding, case folding and non-strings", () => {
  for (const bad of [SNAPSHOT_META_FILE, "aptoide-snapshot.1.json", "aptoide-snapshot.02.json", "aptoide-snapshot.0.json", `aptoide-snapshot.${MAX_SHARDS + 1}.json`, "../aptoide-snapshot.json", "a/aptoide-snapshot.json", "aptoide-snapshot.json.tmp", "APTOIDE-SNAPSHOT.JSON", "aptoide-snapshot.2.json\n", "", null, undefined, 3, {}]) {
    assert.equal(isShardFileName(bad), false, String(bad));
    assert.equal(shardIndexOf(bad), null);
  }
});

// --- timestamps ---

test("parseStamp: Aptoide format, ISO with a zone, and nothing else", () => {
  assert.equal(parseStamp("2026-09-24 08:06:33"), Date.UTC(2026, 8, 24, 8, 6, 33));
  assert.equal(parseStamp("2026-09-24T08:06:33"), Date.UTC(2026, 8, 24, 8, 6, 33));
  assert.equal(parseStamp("2026-09-24T10:06:33+02:00"), Date.UTC(2026, 8, 24, 8, 6, 33));
  assert.equal(parseStamp("2026-09-24T08:06:33Z"), Date.UTC(2026, 8, 24, 8, 6, 33));
  for (const bad of ["2026-02-31 00:00:00", "2026-13-01 00:00:00", "2026-09-24 24:00:00", "2026-09-24", "yesterday", "", " ", null, undefined, 1.7e12, {}, ["2026-09-24 08:06:33"]]) {
    assert.equal(parseStamp(bad), null, String(bad));
  }
});

// --- validation ---

test("invalidReason: names the first problem and never throws", () => {
  assert.equal(invalidReason(app("a.b", null)), null);
  for (const v of [null, undefined, 3, "x", [], true]) assert.equal(invalidReason(v), "not_an_object");
  for (const pkg of [undefined, null, 7, "", "  ", " a.b", "a.b ", "x".repeat(201)]) assert.equal(invalidReason({ package: pkg, file: { filesize: 1 } }), "no_package", String(pkg));
  for (const file of [undefined, null, {}, { filesize: 0 }, { filesize: -1 }, { filesize: "100" }, { filesize: NaN }, { filesize: Infinity }, []]) assert.equal(invalidReason({ package: "a.b", file }), "bad_filesize", JSON.stringify(file));
});

// --- refresh ---

test("refreshDecision: newer refreshes, equal is unchanged, older is stale", () => {
  assert.equal(refreshDecision(app("a", "2026-09-24 08:00:00"), app("a", "2026-09-24 08:00:01")), "refresh");
  assert.equal(refreshDecision(app("a", "2026-09-24 08:00:00"), app("a", "2026-09-24 08:00:00")), "unchanged");
  assert.equal(refreshDecision(app("a", "2026-09-24 08:00:01"), app("a", "2026-09-24 08:00:00")), "stale");
});

test("refreshDecision: compares instants, not strings", () => {
  // 10:00+02:00 is 08:00Z, which is EARLIER than 09:00Z although the string sorts later.
  assert.equal(refreshDecision(app("a", "2026-09-24T09:00:00Z"), app("a", "2026-09-24T10:00:00+02:00")), "stale");
  // A date that sorts lower as a string but is later in time.
  assert.equal(refreshDecision(app("a", "2026-09-24T09:00:00Z"), app("a", "2026-09-24T08:00:00-02:00")), "refresh");
});

test("refreshDecision: `updated` decides when both sides have it; `modified` only when they do not", () => {
  const e = { updated: "2026-09-24 08:00:00", modified: "2026-09-20 00:00:00" };
  assert.equal(refreshDecision(e, { updated: "2026-09-24 08:00:00", modified: "2026-09-30 00:00:00" }), "unchanged", "a newer modified does not override an equal updated");
  assert.equal(refreshDecision({ modified: "2026-09-20 00:00:00" }, { modified: "2026-09-21 00:00:00" }), "refresh");
  assert.equal(refreshDecision({ modified: "2026-09-20 00:00:00" }, { modified: "2026-09-19 00:00:00" }), "stale");
  // updated unparseable on one side: falls through to modified.
  assert.equal(refreshDecision({ updated: "junk", modified: "2026-09-20 00:00:00" }, { updated: "2026-09-25 00:00:00", modified: "2026-09-21 00:00:00" }), "refresh");
});

test("refreshDecision: no common field is incomparable, except that a stamp beats none", () => {
  assert.equal(refreshDecision({ updated: "2026-09-24 08:00:00" }, { modified: "2026-09-25 00:00:00" }), "incomparable");
  assert.equal(refreshDecision({}, {}), "incomparable");
  assert.equal(refreshDecision({ name: "x" }, { updated: "2026-09-24 08:00:00" }), "refresh");
  assert.equal(refreshDecision({ updated: "2026-09-24 08:00:00" }, { name: "x" }), "incomparable");
  for (const v of [null, undefined, 3, "x", []]) {
    assert.doesNotThrow(() => refreshDecision(v, v));
    assert.equal(refreshDecision(v, v), "incomparable");
  }
});

// --- merge ---

test("mergeSnapshot: adds, refreshes in place, leaves equal and older alone, and counts exactly", () => {
  const existing = [app("a", "2026-09-01 00:00:00", { name: "old-a" }), app("b", "2026-09-01 00:00:00"), app("c", "2026-09-05 00:00:00")];
  const incoming = [app("c", "2026-09-04 00:00:00"), app("a", "2026-09-02 00:00:00", { name: "new-a" }), app("b", "2026-09-01 00:00:00"), app("d", "2026-09-01 00:00:00")];
  const r = mergeSnapshot(existing, incoming);
  assert.deepEqual(r.apps.map((a) => a.package), ["a", "b", "c", "d"], "stored apps keep their position, new ones are appended");
  assert.equal(r.apps[0].name, "new-a");
  assert.deepEqual(r.counts, { added: 1, refreshed: 1, unchanged: 1, stale: 1, incomparable: 0, invalid: 0, duplicates_in_batch: 0, existing_dropped: 0 });
});

test("mergeSnapshot: a refresh replaces the whole app, so `versions` attached to the old copy is dropped", () => {
  const r = mergeSnapshot([app("a", "2026-09-01 00:00:00", { versions: [{ version_name: "1" }] })], [app("a", "2026-09-02 00:00:00")]);
  assert.equal("versions" in r.apps[0], false);
  const kept = mergeSnapshot([app("a", "2026-09-01 00:00:00", { versions: [{ version_name: "1" }] })], [app("a", "2026-09-01 00:00:00")]);
  assert.ok("versions" in kept.apps[0], "an unchanged app keeps what is attached to it");
});

test("mergeSnapshot: invalid incoming is skipped and counted, with reasons capped at 50", () => {
  const bad = Array.from({ length: 60 }, (_, i) => ({ package: `p${i}`, file: { filesize: 0 } }));
  const r = mergeSnapshot([], [...bad, null, "x", { file: { filesize: 5 } }, app("ok", null)]);
  assert.equal(r.counts.invalid, 63);
  assert.equal(r.counts.added, 1);
  assert.equal(r.invalid.length, 50);
  assert.equal(r.invalid[0].reason, "bad_filesize");
  assert.deepEqual(r.apps.map((a) => a.package), ["ok"]);
});

test("mergeSnapshot: a package repeated inside the batch is merged by the same rule and counted", () => {
  const r = mergeSnapshot([], [app("a", "2026-09-01 00:00:00", { name: "first" }), app("a", "2026-09-03 00:00:00", { name: "newer" }), app("a", "2026-09-02 00:00:00", { name: "older" })]);
  assert.equal(r.apps.length, 1);
  assert.equal(r.apps[0].name, "newer");
  assert.equal(r.counts.added, 1);
  assert.equal(r.counts.refreshed, 1);
  assert.equal(r.counts.stale, 1);
  assert.equal(r.counts.duplicates_in_batch, 2);
});

test("mergeSnapshot: stored entries with no package are dropped and counted; a stored duplicate keeps the newer", () => {
  const r = mergeSnapshot([null, { name: "no package" }, app("a", "2026-09-01 00:00:00", { name: "old" }), app("a", "2026-09-09 00:00:00", { name: "new" })], []);
  assert.deepEqual(r.apps.map((a) => a.name), ["new"]);
  assert.equal(r.counts.existing_dropped, 3);
});

test("mergeSnapshot: does not mutate its inputs and never throws on hostile input", () => {
  const existing = Object.freeze([Object.freeze(app("a", "2026-09-01 00:00:00"))]);
  const incoming = Object.freeze([Object.freeze(app("a", "2026-09-02 00:00:00")), Object.freeze(app("b", null))]);
  assert.doesNotThrow(() => mergeSnapshot(existing, incoming));
  for (const v of [null, undefined, 5, "x", {}]) {
    const r = mergeSnapshot(v as never, v as never);
    assert.deepEqual(r.apps, []);
  }
  const r = mergeSnapshot([], [{ package: "__proto__", file: { filesize: 1 } }, { package: "constructor", file: { filesize: 1 } }]);
  assert.deepEqual(r.apps.map((a) => a.package), ["__proto__", "constructor"]);
});

test("mergeSnapshot: merging the real snapshot into itself changes nothing", () => {
  const r = mergeSnapshot(real, real);
  assert.equal(r.apps.length, real.length);
  assert.deepEqual(r.apps.map((a) => a.package), real.map((a) => a.package));
  assert.equal(r.counts.unchanged, real.length);
  assert.equal(r.counts.invalid, 0, "every real snapshot app passes the validity check");
  assert.equal(r.counts.refreshed + r.counts.added + r.counts.stale + r.counts.incomparable, 0);
});

// --- shards ---

test("planShards: one shard when it fits, and an empty snapshot is one empty shard", () => {
  const lines = [serializeApp({ a: 1 }), serializeApp({ b: 2 })];
  const p = planShards(lines);
  assert.equal(p.shards.length, 1);
  assert.deepEqual(p.shards[0], lines);
  assert.equal(p.bytes[0], byteLength(serializeShard(lines)));
  const empty = planShards([]);
  assert.equal(empty.shards.length, 1);
  assert.equal(serializeShard(empty.shards[0]), "[]\n");
  assert.equal(JSON.parse(serializeShard([])).length, 0);
});

test("planShards: no shard exceeds the limit, the byte counts are exact, and order is preserved", () => {
  const lines = Array.from({ length: 200 }, (_, i) => serializeApp({ package: `p${i}`, pad: "é".repeat(i % 17) }));
  for (const limit of [400, 1024, 4096]) {
    const p = planShards(lines, limit);
    assert.deepEqual(p.shards.flat(), lines, `order at ${limit}`);
    for (let i = 0; i < p.shards.length; i += 1) {
      const text = serializeShard(p.shards[i]);
      assert.equal(p.bytes[i], byteLength(text));
      if (p.shards[i].length > 1) assert.ok(p.bytes[i] <= limit, `shard ${i} is ${p.bytes[i]} > ${limit}`);
      assert.equal(JSON.parse(text).length, p.shards[i].length, "each shard is a valid JSON array");
    }
  }
});

test("planShards: a shard is full before the next opens, and the split is exactly where one more line would not fit", () => {
  const lines = Array.from({ length: 10 }, (_, i) => serializeApp({ n: i }));
  const one = byteLength(lines[0]);
  // Frame is 5 bytes; two lines need 5 + 2*one + 2.
  const p = planShards(lines, 5 + 2 * one + 2);
  assert.equal(p.shards.length, 5);
  assert.ok(p.shards.every((s) => s.length === 2));
  const q = planShards(lines, 5 + 2 * one + 1);
  assert.equal(q.shards.length, 10, "one byte short of two lines: one line per shard");
});

test("planShards: an app bigger than the limit sits alone and is counted, never dropped", () => {
  const big = serializeApp({ package: "big", pad: "x".repeat(500) });
  const p = planShards([serializeApp({ a: 1 }), big, serializeApp({ b: 2 })], 100);
  assert.equal(p.oversize, 1);
  assert.equal(p.shards.flat().length, 3);
  assert.deepEqual(p.shards[1], [big]);
});

test("planShards: refuses a bad limit and a snapshot that would need more than MAX_SHARDS", () => {
  for (const bad of [0, 15, -1, 1.5, NaN, Infinity]) assert.throws(() => planShards([], bad), RangeError, String(bad));
  const lines = Array.from({ length: MAX_SHARDS + 1 }, (_, i) => serializeApp({ i }));
  assert.throws(() => planShards(lines, 16), RangeError);
  assert.equal(planShards(lines.slice(0, MAX_SHARDS), 16).shards.length, MAX_SHARDS);
});

test("the default limit is 8 MiB and the 12-app fixture is a small fraction of it", () => {
  assert.equal(SNAPSHOT_SHARD_LIMIT_BYTES, 8 * 1024 * 1024);
  const p = planShards(real.map(serializeApp));
  assert.equal(p.shards.length, 1);
  assert.ok(p.bytes[0] < 200_000, `12 real apps are ${p.bytes[0]} bytes`);
});

// --- header ---

const goodMeta = () => buildSnapshotMeta({ generatedAt: "2026-10-01T12:00:00.000Z", runnerCountry: "NG", plan: planShards(Array.from({ length: 6 }, (_, i) => serializeApp({ package: `p${i}` })), 40), limitBytes: 40 });

test("header: built from a plan, listing every shard, and read back unchanged", () => {
  const m = goodMeta();
  assert.ok(m.shards.length > 1);
  assert.equal(m.count, 6);
  assert.equal(m.total_bytes, m.shards.reduce((n, s) => n + s.bytes, 0));
  assert.deepEqual(m.shards.map((s) => s.file), m.shards.map((_, i) => shardFileName(i)));
  assert.deepEqual(parseSnapshotMeta(JSON.stringify(m)), m);
  assert.deepEqual(parseSnapshotMeta(m), m);
  assert.equal(parseSnapshotMeta({ ...m, runner_country: null })?.runner_country, null);
});

test("header: anything that is not exactly what buildSnapshotMeta writes is refused", () => {
  const m = goodMeta();
  const cases: [string, unknown][] = [
    ["not json", "{"],
    ["null", null],
    ["array", []],
    ["other schema", { ...m, schema_version: 2 }],
    ["generated_at missing", { ...m, generated_at: undefined }],
    ["generated_at junk", { ...m, generated_at: "soon" }],
    ["country too long", { ...m, runner_country: "NGA" }],
    ["country number", { ...m, runner_country: 3 }],
    ["count wrong", { ...m, count: m.count + 1 }],
    ["count fractional", { ...m, count: 1.5 }],
    ["limit negative", { ...m, limit_bytes: -1 }],
    ["no shards", { ...m, shards: [] }],
    ["shards not an array", { ...m, shards: "x" }],
    ["too many shards (properly named up to the cap, one more after)", { ...m, count: 0, shards: Array.from({ length: MAX_SHARDS + 1 }, (_, i) => ({ file: i < MAX_SHARDS ? shardFileName(i) : `aptoide-snapshot.${MAX_SHARDS + 1}.json`, count: 0, bytes: 0 })) }],
    ["out of order", { ...m, shards: [m.shards[1], m.shards[0], ...m.shards.slice(2)] }],
    ["traversal", { ...m, shards: [{ ...m.shards[0], file: "../aptoide-snapshot.json" }, ...m.shards.slice(1)] }],
    ["shard count negative", { ...m, shards: [{ ...m.shards[0], count: -1 }, ...m.shards.slice(1)] }],
    ["shard is a string", { ...m, shards: ["aptoide-snapshot.json"] }],
  ];
  for (const [label, v] of cases) assert.equal(parseSnapshotMeta(v), null, label);
});

// --- loading ---

test("load: no files is an empty catalog with no problems", async () => {
  assert.deepEqual(await loadSnapshotFrom(memory({})), { apps: [], meta: null, problems: [] });
});

test("load: a bare array with no header loads exactly as it always did", async () => {
  const r = await loadSnapshotFrom(memory({ [SNAPSHOT_FILE]: JSON.stringify(real, null, 2) }));
  assert.equal(r.apps.length, real.length);
  assert.equal(r.meta, null);
  assert.deepEqual(r.problems, []);
});

test("load: header plus shards round-trips and keeps order", async () => {
  const apps = Array.from({ length: 30 }, (_, i) => app(`p${i}`, "2026-09-01 00:00:00"));
  const plan = planShards(apps.map(serializeApp), 600);
  assert.ok(plan.shards.length > 2);
  const meta = buildSnapshotMeta({ generatedAt: "2026-10-01T00:00:00Z", runnerCountry: null, plan, limitBytes: 600 });
  const files: Record<string, string> = { [SNAPSHOT_META_FILE]: JSON.stringify(meta) };
  plan.shards.forEach((s, i) => (files[shardFileName(i)] = serializeShard(s)));
  const r = await loadSnapshotFrom(memory(files));
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.apps, apps);
  assert.equal(r.meta?.shards.length, plan.shards.length);
});

test("load: a missing shard, a corrupt shard, a non-array and a count mismatch are reported, and the rest still loads", async () => {
  const apps = Array.from({ length: 6 }, (_, i) => app(`p${i}`, null));
  const plan = planShards(apps.map(serializeApp), 160);
  assert.ok(plan.shards.length >= 3, `got ${plan.shards.length} shards`);
  const meta = buildSnapshotMeta({ generatedAt: "2026-10-01T00:00:00Z", runnerCountry: "US", plan, limitBytes: 160 });
  const full: Record<string, string> = { [SNAPSHOT_META_FILE]: JSON.stringify(meta) };
  plan.shards.forEach((s, i) => (full[shardFileName(i)] = serializeShard(s)));

  const missing = { ...full };
  delete missing[shardFileName(1)];
  const a = await loadSnapshotFrom(memory(missing));
  assert.deepEqual(a.problems, [`missing_shard:${shardFileName(1)}`]);
  assert.equal(a.apps.length, apps.length - plan.shards[1].length);

  const b = await loadSnapshotFrom(memory({ ...full, [shardFileName(1)]: "[" }));
  assert.deepEqual(b.problems, [`unreadable_shard:${shardFileName(1)}`]);

  const c = await loadSnapshotFrom(memory({ ...full, [shardFileName(1)]: "{}" }));
  assert.deepEqual(c.problems, [`not_an_array:${shardFileName(1)}`]);

  const d = await loadSnapshotFrom(memory({ ...full, [shardFileName(1)]: serializeShard(plan.shards[1].slice(1)) }));
  assert.deepEqual(d.problems, [`count_mismatch:${shardFileName(1)}`]);
});

test("load: an invalid header is a problem and shard 0 alone is still read; a header with no shard 0 is missing, not 'no snapshot'", async () => {
  const r = await loadSnapshotFrom(memory({ [SNAPSHOT_META_FILE]: "garbage", [SNAPSHOT_FILE]: JSON.stringify([app("a", null)]) }));
  assert.deepEqual(r.problems, ["invalid_meta"]);
  assert.equal(r.apps.length, 1);
  const m = goodMeta();
  const r2 = await loadSnapshotFrom(memory({ [SNAPSHOT_META_FILE]: JSON.stringify(m) }));
  assert.ok(r2.problems.includes(`missing_shard:${SNAPSHOT_FILE}`));
});

test("load: items that are not objects with a string package are skipped and counted, never thrown on", async () => {
  const r = await loadSnapshotFrom(memory({ [SNAPSHOT_FILE]: JSON.stringify([null, 3, "x", [], { package: 5 }, { name: "no package" }, app("ok", null)]) }));
  assert.deepEqual(r.apps.map((a) => a.package), ["ok"]);
  assert.deepEqual(r.problems, [`skipped_items:${SNAPSHOT_FILE}:6`]);
});

test("load: a reader that throws is not swallowed (the storefront's loader decides what that means)", async () => {
  await assert.rejects(loadSnapshotFrom(async () => { throw new Error("EACCES"); }), /EACCES/);
});

// --- files on disk ---

test("io: write, read back, shard, shrink and clean up stale shards", async () => {
  const dir = mkdtempSync(join(tmpdir(), "snap-"));
  try {
    const small = await writeSnapshotFiles(dir, real, { generatedAt: "2026-10-01T10:00:00.000Z", runnerCountry: "NG", limitBytes: 30_000 });
    assert.ok(small.written.length >= 4, `12 apps at ~9.6 KB in 30 KB shards: ${small.written.length}`);
    assert.equal(small.meta.count, real.length);
    assert.equal(small.meta.runner_country, "NG");
    assert.deepEqual(readdirSync(dir).sort(), [...small.written, SNAPSHOT_META_FILE].sort(), "no .tmp file is left behind");
    for (const s of small.meta.shards) assert.equal(readFileSync(join(dir, s.file)).length, s.bytes, `${s.file} is the size the header says`);

    const back = await readSnapshotFiles(dir);
    assert.deepEqual(back.problems, []);
    assert.deepEqual(back.apps, real, "every app comes back, in order, unchanged");

    const big = await writeSnapshotFiles(dir, real, { generatedAt: "2026-10-02T10:00:00.000Z", runnerCountry: null });
    assert.deepEqual(big.written, [SNAPSHOT_FILE]);
    assert.deepEqual(big.removed, small.written.slice(1).sort());
    assert.deepEqual(readdirSync(dir).sort(), [SNAPSHOT_FILE, SNAPSHOT_META_FILE]);
    const text = readFileSync(join(dir, SNAPSHOT_FILE), "utf8");
    assert.deepEqual(JSON.parse(text), real);
    assert.equal(text.split("\n").length, real.length + 3, "one app per line inside the brackets");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("io: refuses to read anything that is not a snapshot file name", async () => {
  const dir = mkdtempSync(join(tmpdir(), "snap-"));
  try {
    writeFileSync(join(dir, "secret.txt"), "x");
    const read = fsReadText(dir);
    await assert.rejects(read("secret.txt"), /not a snapshot file name/);
    await assert.rejects(read("../secret.txt"), /not a snapshot file name/);
    assert.equal(await read(SNAPSHOT_FILE), null);
    assert.equal(existsSync(join(dir, "secret.txt")), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("io: a plan that needs too many shards throws before anything is written", async () => {
  const dir = mkdtempSync(join(tmpdir(), "snap-"));
  try {
    const apps = Array.from({ length: MAX_SHARDS + 1 }, (_, i) => ({ package: `p${i}` }));
    await assert.rejects(writeSnapshotFiles(dir, apps, { generatedAt: "2026-10-01T00:00:00Z", runnerCountry: null, limitBytes: 16 }), RangeError);
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
