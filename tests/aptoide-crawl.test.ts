import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  APTOIDE_LIST_MAX_LIMIT,
  DEFAULT_CAPS,
  MAX_ITEMS_READ_PER_PAGE,
  MAX_NAME_LENGTH,
  MAX_PACKAGE_LENGTH,
  PAUSED_REASONS,
  TERMINAL_REASONS,
  applyPage,
  dedupeCandidates,
  isUsablePackage,
  newCheckpoint,
  normalizeCaps,
  pauseCheckpoint,
  readCandidate,
  readCheckpoint,
  readListPage,
  type CrawlCandidate,
  type CrawlCaps,
  type CrawlCheckpoint,
  type ListPage,
} from "../lib/aptoide-crawl";

// Leaf 5.h.ix.zi.
//
// The fixtures are rebuilt from what the repo records, NOT copied from the probe
// file `aptoide-probe2-20260930T073127Z.txt` (it is not in the repo): the
// envelope fields are the ones the `5.h.vi.zi` note names (`datalist.total`,
// `count`, `offset`, `limit`, `next`, `hidden`, `list`), and the twelve items
// carry the real `package`, `name`, `updated` and `stats.downloads` values from
// `storage/downloads/aptoide-snapshot.json`, in the item shape the probe
// recorded (`stats` = `downloads, pdownloads, rating, prating`; `file` without
// `malware`).

const NOW = "2026-09-30T12:00:00.000Z";
const LATER = "2026-09-30T12:00:05.000Z";

const REAL_ROWS: Array<[string, string, string, number]> = [
  ["com.whatsapp", "WhatsApp Messenger", "2026-09-24 08:06:33", 2000000000],
  ["com.termux", "Termux", "2026-09-22 11:35:05", 10000000],
  ["org.videolan.vlc", "VLC for Android", "2026-09-23 23:56:04", 500000000],
  ["org.mozilla.firefox", "Firefox Fast & Private Browser", "2026-09-23 21:34:18", 500000000],
  ["com.waze", "Waze Navigation & Live Traffic", "2026-09-24 08:49:35", 500000000],
  ["org.khanacademy.android", "Khan Academy", "2026-08-15 17:20:55", 10000000],
  ["com.gau.go.launcherex", "GO Launcher Prime", "2026-05-07 23:05:36", 100000000],
  ["com.better.alarm", "Simple Alarm Clock", "2025-12-06 02:11:52", 1000000],
  ["org.readera", "ReadEra – book reader pdf epub", "2026-09-11 13:35:06", 50000000],
  ["md.obsidian", "Obsidian", "2026-08-21 17:35:36", 5000000],
  ["com.github.android", "GitHub", "2026-09-17 15:41:27", 10000000],
  ["org.totschnig.myexpenses", "My Expenses", "2026-09-24 02:29:36", 1000000],
];

function listItem(pkg: string, name: string, updated: string, downloads: number): Record<string, unknown> {
  return {
    id: 76767342,
    name,
    package: pkg,
    uname: pkg.replace(/\./g, "-"),
    size: 93575259,
    icon: "https://pool.img.aptoide.com/appupdater/icon.png",
    added: "2020-12-04 22:02:26",
    modified: "2026-09-23 22:05:05",
    updated,
    uptype: "regular",
    developer: { id: 6301, name: "Someone" },
    file: { vername: "1.0", vercode: 1, md5sum: "0".repeat(32), filesize: 1, signature: { sha1: "AA:BB", owner: "CN=x" }, tags: [] },
    stats: { downloads, pdownloads: downloads, rating: { avg: 4.1, total: 10 }, prating: { avg: 4.1, total: 10 } },
    store: { id: 15, name: "apps" },
    urls: { w: "https://example.invalid/app" },
  };
}

function envelope(list: unknown[], extra: Record<string, unknown> = {}): unknown {
  return {
    info: { status: "OK" },
    datalist: { total: 448401, count: list.length, offset: 0, limit: 100, next: 244, hidden: 0, list, ...extra },
  };
}

const REAL_PAGE = envelope(REAL_ROWS.map((r) => listItem(...r)));

function pageOf(packages: string[], extra: Partial<ListPage> = {}): ListPage {
  const candidates: CrawlCandidate[] = packages.map((p) => ({ package: p, name: p, updated: "2026-09-24 08:06:33", downloads: 1000 }));
  return { ok: true, candidates, skipped: 0, listLength: candidates.length, total: 448401, offset: 0, next: 244, ...extra };
}

const CAPS: CrawlCaps = { maxRequests: 60, maxCandidates: 5000, maxOffset: null };

function fresh(): CrawlCheckpoint {
  return newCheckpoint({ sort: "downloads", limit: 100, now: NOW });
}

function readOk(json: unknown): ListPage {
  const result = readListPage(json);
  assert.equal(result.ok, true);
  return result as ListPage;
}

// ---------------------------------------------------------------------------
// Reading a page
// ---------------------------------------------------------------------------

test("a real-shaped page reads into candidates with package, name, updated and downloads, in order", () => {
  const page = readOk(REAL_PAGE);
  assert.equal(page.candidates.length, 12);
  assert.equal(page.skipped, 0);
  assert.equal(page.listLength, 12);
  assert.equal(page.total, 448401);
  assert.equal(page.offset, 0);
  assert.equal(page.next, 244);
  assert.deepEqual(page.candidates[0], {
    package: "com.whatsapp",
    name: "WhatsApp Messenger",
    updated: "2026-09-24 08:06:33",
    downloads: 2000000000,
  });
  assert.deepEqual(
    page.candidates.map((c) => c.package),
    REAL_ROWS.map((r) => r[0]),
  );
  // a non-ASCII name survives untouched
  assert.equal(page.candidates[8].name, "ReadEra – book reader pdf epub");
});

test("a page is read without reading anything trust-related: no malware field is needed or invented", () => {
  const page = readOk(REAL_PAGE);
  for (const c of page.candidates) assert.deepEqual(Object.keys(c).sort(), ["downloads", "name", "package", "updated"]);
});

test("an empty list is a valid page, not a failure", () => {
  const page = readOk(envelope([], { next: null }));
  assert.equal(page.listLength, 0);
  assert.deepEqual(page.candidates, []);
  assert.equal(page.next, null);
});

test("anything that is not the expected envelope is a failure with a reason, never a silent empty page", () => {
  const notObjects: unknown[] = [undefined, null, 0, 42, NaN, true, "", "datalist", [], [1, 2], () => 1, Symbol("x")];
  for (const value of notObjects) {
    assert.deepEqual(readListPage(value), { ok: false, reason: "not_an_object" }, String(typeof value));
  }
  assert.deepEqual(readListPage({}), { ok: false, reason: "no_datalist" });
  assert.deepEqual(readListPage({ info: {} }), { ok: false, reason: "no_datalist" });
  for (const datalist of [null, 1, "x", [], true]) {
    assert.deepEqual(readListPage({ datalist }), { ok: false, reason: "no_datalist" });
  }
  for (const list of [undefined, null, 1, "x", {}, true]) {
    assert.deepEqual(readListPage({ datalist: { list } }), { ok: false, reason: "no_list" });
  }
});

test("an object whose properties throw on read is an unreadable page, and nothing throws", () => {
  const hostile = new Proxy({}, { get() { throw new Error("boom"); }, has() { throw new Error("boom"); }, getPrototypeOf() { throw new Error("boom"); } });
  assert.doesNotThrow(() => readListPage(hostile));
  assert.equal(readListPage({ datalist: hostile }).ok, false);
  const badItem = new Proxy({}, { get() { throw new Error("boom"); }, getPrototypeOf() { throw new Error("boom"); } });
  const result = readListPage(envelope([listItem("a.b", "A", "x", 1), badItem, listItem("c.d", "C", "y", 2)]));
  assert.equal(result.ok, true);
  const page = result as ListPage;
  assert.deepEqual(page.candidates.map((c) => c.package), ["a.b", "c.d"]);
  assert.equal(page.skipped, 1);
});

test("unusable items are skipped and counted; the usable ones on either side are kept in order", () => {
  const bad: unknown[] = [null, undefined, 7, "com.x", [], true, {}, { package: 5 }, { package: "" }, { package: "has space" }, { package: "a/b" }, { package: "../x" }, { package: ".hidden" }, { package: "a\nb" }, { package: "x".repeat(MAX_PACKAGE_LENGTH + 1) }];
  const list = [listItem("first.app", "First", "u1", 1), ...bad, listItem("last.app", "Last", "u2", 2)];
  const page = readOk(envelope(list));
  assert.deepEqual(page.candidates.map((c) => c.package), ["first.app", "last.app"]);
  assert.equal(page.skipped, bad.length);
  assert.equal(page.listLength, list.length);
});

test("package validation: what a URL path and a file can safely carry", () => {
  for (const ok of ["com.whatsapp", "org.videolan.vlc", "a", "A1", "_x.y", "com.example.app-2", "x".repeat(MAX_PACKAGE_LENGTH)]) {
    assert.equal(isUsablePackage(ok), true, ok);
  }
  for (const bad of ["", " ", "a b", "a/b", "a\\b", "a?b", "a#b", "a%2Fb", "a=b", "-a", ".a", "a\u0000b", "é.app", 1, null, undefined, {}, [], "x".repeat(MAX_PACKAGE_LENGTH + 1)]) {
    assert.equal(isUsablePackage(bad), false, String(bad));
  }
});

test("a candidate with a good package and unusable other fields keeps the package and nulls the rest", () => {
  const nameBad: unknown[] = [undefined, null, 1, {}, [], "", "   "];
  for (const name of nameBad) assert.equal(readCandidate({ package: "a.b", name })?.name, null);
  const updatedBad: unknown[] = [undefined, null, 1, {}, "", "  ", "x".repeat(41)];
  for (const updated of updatedBad) assert.equal(readCandidate({ package: "a.b", updated })?.updated, null);
  const downloadsBad: unknown[] = [undefined, null, "100", -1, 1.5, NaN, Infinity, -Infinity, 2 ** 53, {}, [], true];
  for (const downloads of downloadsBad) assert.equal(readCandidate({ package: "a.b", stats: { downloads } })?.downloads, null, String(downloads));
  for (const stats of [undefined, null, 5, "x", [], [1]]) assert.equal(readCandidate({ package: "a.b", stats })?.downloads, null);
  assert.equal(readCandidate({ package: "a.b", stats: { downloads: 0 } })?.downloads, 0);
  assert.equal(readCandidate({ package: "a.b", stats: { downloads: 500000000 } })?.downloads, 500000000);
});

test("names are trimmed and cut, not rejected; updated is kept verbatim apart from trimming", () => {
  assert.equal(readCandidate({ package: "a.b", name: "  Spaced  " })?.name, "Spaced");
  assert.equal(readCandidate({ package: "a.b", name: "n".repeat(MAX_NAME_LENGTH + 50) })?.name?.length, MAX_NAME_LENGTH);
  assert.equal(readCandidate({ package: "a.b", updated: " 2026-09-24 08:06:33 " })?.updated, "2026-09-24 08:06:33");
});

test("total, offset and next are read only as non-negative whole numbers; anything else is null", () => {
  const bad: unknown[] = [undefined, null, "244", "0", -1, 1.5, NaN, Infinity, 2 ** 53, {}, [], true];
  for (const value of bad) {
    const page = readOk({ datalist: { list: [], total: value, offset: value, next: value } });
    assert.equal(page.total, null, String(value));
    assert.equal(page.offset, null, String(value));
    assert.equal(page.next, null, String(value));
  }
  const good = readOk({ datalist: { list: [], total: 448401, offset: 0, next: 244 } });
  assert.deepEqual([good.total, good.offset, good.next], [448401, 0, 244]);
});

test("a page claiming far more items than it should is cut at the read bound and the rest are counted as skipped", () => {
  const list = Array.from({ length: MAX_ITEMS_READ_PER_PAGE + 25 }, (_, i) => listItem(`pkg.n${i}`, `N${i}`, "u", i));
  const page = readOk(envelope(list));
  assert.equal(page.candidates.length, MAX_ITEMS_READ_PER_PAGE);
  assert.equal(page.skipped, 25);
  assert.equal(page.listLength, MAX_ITEMS_READ_PER_PAGE + 25);
});

test("reading a page does not modify its input", () => {
  const input = JSON.parse(JSON.stringify(REAL_PAGE));
  const before = JSON.stringify(input);
  readListPage(input);
  assert.equal(JSON.stringify(input), before);
});

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

test("dedupe drops packages already seen and repeats within the page; first occurrence wins; order kept; seen untouched", () => {
  const seen = new Set(["a.a"]);
  const incoming: CrawlCandidate[] = [
    { package: "a.a", name: "seen", updated: null, downloads: null },
    { package: "b.b", name: "first", updated: null, downloads: 1 },
    { package: "c.c", name: "c", updated: null, downloads: null },
    { package: "b.b", name: "second", updated: null, downloads: 2 },
  ];
  const out = dedupeCandidates(incoming, seen);
  assert.deepEqual(out.map((c) => [c.package, c.name]), [["b.b", "first"], ["c.c", "c"]]);
  assert.deepEqual([...seen], ["a.a"]);
});

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

test("caps from anything: a bad or missing field takes its default and a run can never be unbounded", () => {
  assert.deepEqual(normalizeCaps(undefined), DEFAULT_CAPS);
  assert.deepEqual(normalizeCaps(null), DEFAULT_CAPS);
  assert.deepEqual(normalizeCaps("x"), DEFAULT_CAPS);
  assert.deepEqual(normalizeCaps([]), DEFAULT_CAPS);
  assert.deepEqual(normalizeCaps({ maxRequests: 0, maxCandidates: -5, maxOffset: -1 }), DEFAULT_CAPS);
  assert.deepEqual(normalizeCaps({ maxRequests: "9", maxCandidates: NaN, maxOffset: "5" }), DEFAULT_CAPS);
  assert.deepEqual(normalizeCaps({ maxRequests: Infinity, maxCandidates: 1.5 }), DEFAULT_CAPS);
  assert.deepEqual(normalizeCaps({ maxRequests: 3, maxCandidates: 250, maxOffset: 1000 }), { maxRequests: 3, maxCandidates: 250, maxOffset: 1000 });
  assert.equal(normalizeCaps({ maxOffset: 0 }).maxOffset, 0);
  assert.equal(DEFAULT_CAPS.maxCandidates, 5000);
});

// ---------------------------------------------------------------------------
// The cursor and the stop rules
// ---------------------------------------------------------------------------

test("a normal page continues at Aptoide's cursor, not at offset + limit", () => {
  const { checkpoint, accepted } = applyPage(fresh(), pageOf(["a.a", "b.b"], { next: 244 }), CAPS, LATER, new Set(), 1);
  assert.equal(checkpoint.offset, 244);
  assert.notEqual(checkpoint.offset, 0 + checkpoint.limit);
  assert.equal(checkpoint.done, false);
  assert.equal(checkpoint.stop_reason, null);
  assert.equal(checkpoint.requests, 1);
  assert.equal(checkpoint.candidates, 2);
  assert.equal(checkpoint.updated_at, LATER);
  assert.equal(checkpoint.started_at, NOW);
  assert.deepEqual(accepted.map((c) => c.package), ["a.a", "b.b"]);
});

test("stop: no cursor", () => {
  const { checkpoint } = applyPage(fresh(), pageOf(["a.a"], { next: null }), CAPS, LATER, new Set(), 1);
  assert.deepEqual([checkpoint.done, checkpoint.stop_reason], [true, "no_cursor"]);
});

test("stop: an empty page ends the crawl even if a cursor is present", () => {
  const { checkpoint, accepted } = applyPage(fresh(), pageOf([], { next: 500 }), CAPS, LATER, new Set(), 1);
  assert.deepEqual([checkpoint.done, checkpoint.stop_reason], [true, "empty_page"]);
  assert.deepEqual(accepted, []);
});

test("stop: a cursor that does not advance (equal to, or behind, the offset just requested)", () => {
  let cp = { ...fresh(), offset: 300 };
  for (const next of [300, 299, 0]) {
    const { checkpoint } = applyPage(cp, pageOf(["a.a"], { offset: 300, next }), CAPS, LATER, new Set(), 1);
    assert.deepEqual([checkpoint.done, checkpoint.stop_reason], [true, "cursor_stalled"], `next=${next}`);
  }
  cp = fresh();
  const first = applyPage(cp, pageOf(["a.a"], { next: 0 }), CAPS, LATER, new Set(), 1);
  assert.equal(first.checkpoint.stop_reason, "cursor_stalled");
});

test("stop: the cursor reaches or passes the reported total", () => {
  for (const next of [1000, 1001, 5000]) {
    const { checkpoint } = applyPage(fresh(), pageOf(["a.a"], { total: 1000, next }), CAPS, LATER, new Set(), 1);
    assert.equal(checkpoint.stop_reason, "end_of_list", `next=${next}`);
  }
  const ok = applyPage(fresh(), pageOf(["a.a"], { total: 1000, next: 999 }), CAPS, LATER, new Set(), 1);
  assert.equal(ok.checkpoint.done, false);
  // an unknown total never ends the crawl by itself
  const unknown = applyPage(fresh(), pageOf(["a.a"], { total: null, next: 10 ** 9 }), CAPS, LATER, new Set(), 1);
  assert.equal(unknown.checkpoint.done, false);
});

test("stop: the depth cap, exclusive of an offset equal to the cap", () => {
  const caps = { ...CAPS, maxOffset: 1000 };
  assert.equal(applyPage(fresh(), pageOf(["a.a"], { next: 1001 }), caps, LATER, new Set(), 1).checkpoint.stop_reason, "depth_cap");
  const at = applyPage(fresh(), pageOf(["a.a"], { next: 1000 }), caps, LATER, new Set(), 1);
  assert.equal(at.checkpoint.done, false);
  assert.equal(at.checkpoint.offset, 1000);
  const zero = { ...CAPS, maxOffset: 0 };
  assert.equal(applyPage(fresh(), pageOf(["a.a"], { next: 1 }), zero, LATER, new Set(), 1).checkpoint.stop_reason, "depth_cap");
});

test("stop: the candidate target ends the crawl and over-target candidates are dropped, not written", () => {
  const caps = { ...CAPS, maxCandidates: 3 };
  const { checkpoint, accepted } = applyPage(fresh(), pageOf(["a.a", "b.b", "c.c", "d.d", "e.e"]), caps, LATER, new Set(), 1);
  assert.deepEqual([checkpoint.done, checkpoint.stop_reason, checkpoint.candidates], [true, "target_reached", 3]);
  assert.deepEqual(accepted.map((c) => c.package), ["a.a", "b.b", "c.c"]);
  // exactly meeting the target counts as reached
  const exact = applyPage(fresh(), pageOf(["a.a", "b.b", "c.c"]), caps, LATER, new Set(), 1);
  assert.equal(exact.checkpoint.stop_reason, "target_reached");
  // a later page can never push the total over the target
  const cp2 = { ...fresh(), candidates: 2, offset: 244 };
  const more = applyPage(cp2, pageOf(["x.x", "y.y"], { offset: 244, next: 500 }), caps, LATER, new Set(), 1);
  assert.deepEqual([more.accepted.length, more.checkpoint.candidates], [1, 3]);
});

test("the target is checked before the page-level stops, so a full run is reported as reached", () => {
  const caps = { ...CAPS, maxCandidates: 2 };
  const out = applyPage(fresh(), pageOf(["a.a", "b.b"], { next: null }), caps, LATER, new Set(), 1);
  assert.equal(out.checkpoint.stop_reason, "target_reached");
});

test("the per-run request cap PAUSES the crawl at the cursor so a later run resumes; it is not a finish", () => {
  const caps = { ...CAPS, maxRequests: 2 };
  const first = applyPage(fresh(), pageOf(["a.a"], { next: 244 }), caps, LATER, new Set(), 1);
  assert.equal(first.checkpoint.done, false);
  assert.equal(first.checkpoint.stop_reason, null);
  const second = applyPage(first.checkpoint, pageOf(["b.b"], { offset: 244, next: 500 }), caps, LATER, new Set(["a.a"]), 2);
  assert.deepEqual([second.checkpoint.done, second.checkpoint.stop_reason, second.checkpoint.offset], [false, "request_cap", 500]);
  assert.equal(second.checkpoint.requests, 2);
  // the cap counts requests in THIS run: a resumed run with a low count carries on and clears the pause
  const resumed = applyPage(second.checkpoint, pageOf(["c.c"], { offset: 500, next: 800 }), caps, LATER, new Set(["a.a", "b.b"]), 1);
  assert.deepEqual([resumed.checkpoint.done, resumed.checkpoint.stop_reason, resumed.checkpoint.requests], [false, null, 3]);
});

test("a page that says it starts somewhere other than where it was asked to is refused and nothing is kept", () => {
  const cp = { ...fresh(), offset: 244 };
  const { checkpoint, accepted } = applyPage(cp, pageOf(["a.a"], { offset: 0, next: 300 }), CAPS, LATER, new Set(), 1);
  assert.deepEqual([checkpoint.done, checkpoint.stop_reason, checkpoint.candidates], [true, "offset_mismatch", 0]);
  assert.deepEqual(accepted, []);
  assert.equal(checkpoint.offset, 244);
  // a page that does not echo an offset is not refused for that
  const silent = applyPage(cp, pageOf(["a.a"], { offset: null, next: 300 }), CAPS, LATER, new Set(), 1);
  assert.equal(silent.checkpoint.done, false);
});

test("duplicates and skipped items are counted in the checkpoint", () => {
  const seen = new Set(["a.a"]);
  const page = pageOf(["a.a", "b.b", "b.b", "c.c"], { skipped: 3 });
  const { checkpoint, accepted } = applyPage(fresh(), page, CAPS, LATER, seen, 1);
  assert.deepEqual(accepted.map((c) => c.package), ["b.b", "c.c"]);
  assert.deepEqual([checkpoint.candidates, checkpoint.duplicates, checkpoint.skipped], [2, 2, 3]);
  assert.equal(seen.size, 1);
});

test("a page whose items are all unusable does not end the crawl while the cursor is good; the items are counted as skipped", () => {
  const junk = readOk(envelope([null, 5, {}, { package: "a b" }], { next: 244 }));
  assert.equal(junk.listLength, 4);
  assert.equal(junk.candidates.length, 0);
  const { checkpoint, accepted } = applyPage(fresh(), junk, CAPS, LATER, new Set(), 1);
  assert.deepEqual([checkpoint.done, checkpoint.stop_reason, checkpoint.offset, checkpoint.skipped], [false, null, 244, 4]);
  assert.deepEqual(accepted, []);
});

test("skipped, duplicates and requests add up across pages", () => {
  const seen = new Set<string>();
  const one = applyPage(fresh(), pageOf(["a.a", "b.b"], { skipped: 2, next: 244 }), CAPS, LATER, seen, 1);
  for (const c of one.accepted) seen.add(c.package);
  const two = applyPage(one.checkpoint, pageOf(["b.b", "c.c"], { offset: 244, skipped: 5, next: 500 }), CAPS, LATER, seen, 2);
  assert.deepEqual([two.checkpoint.skipped, two.checkpoint.duplicates, two.checkpoint.requests, two.checkpoint.candidates], [7, 1, 2, 3]);
});

test("the total is remembered across pages that do not repeat it", () => {
  const first = applyPage(fresh(), pageOf(["a.a"], { total: 777 }), CAPS, LATER, new Set(), 1).checkpoint;
  const second = applyPage(first, pageOf(["b.b"], { offset: 244, total: null, next: 300 }), CAPS, LATER, new Set(["a.a"]), 2).checkpoint;
  assert.equal(second.total, 777);
});

test("a finished checkpoint is returned unchanged and accepts nothing", () => {
  const done = applyPage(fresh(), pageOf(["a.a"], { next: null }), CAPS, LATER, new Set(), 1).checkpoint;
  assert.equal(done.done, true);
  const again = applyPage(done, pageOf(["z.z"], { offset: done.offset, next: 99999 }), CAPS, "2027-01-01T00:00:00.000Z", new Set(), 1);
  assert.equal(again.checkpoint, done);
  assert.deepEqual(again.accepted, []);
});

test("applyPage and pauseCheckpoint do not modify their inputs", () => {
  const cp = fresh();
  const before = JSON.stringify(cp);
  const seen = new Set(["q.q"]);
  const page = pageOf(["a.a", "b.b"]);
  const pageBefore = JSON.stringify(page);
  applyPage(cp, page, CAPS, LATER, seen, 1);
  pauseCheckpoint(cp, "blocked", LATER);
  assert.equal(JSON.stringify(cp), before);
  assert.equal(JSON.stringify(page), pageBefore);
  assert.deepEqual([...seen], ["q.q"]);
});

// ---------------------------------------------------------------------------
// Pausing for reasons the runner decides
// ---------------------------------------------------------------------------

test("blocked and bad_page pause the crawl at the same offset so a later run retries that page", () => {
  const cp = { ...fresh(), offset: 244, requests: 3, candidates: 200 };
  for (const reason of ["blocked", "bad_page"] as const) {
    const paused = pauseCheckpoint(cp, reason, LATER);
    assert.deepEqual([paused.done, paused.stop_reason, paused.offset, paused.requests, paused.candidates, paused.updated_at], [false, reason, 244, 3, 200, LATER]);
    assert.notEqual(paused, cp);
    // a paused checkpoint survives a save and load, and applying the next page resumes it
    const reloaded = readCheckpoint(JSON.parse(JSON.stringify(paused)));
    assert.deepEqual(reloaded, paused);
    const resumed = applyPage(reloaded as CrawlCheckpoint, pageOf(["a.a"], { offset: 244, next: 400 }), CAPS, LATER, new Set(), 1);
    assert.deepEqual([resumed.checkpoint.done, resumed.checkpoint.stop_reason, resumed.checkpoint.offset], [false, null, 400]);
  }
});

test("pausing a finished checkpoint changes nothing", () => {
  const done = applyPage(fresh(), pageOf(["a.a"], { next: null }), CAPS, LATER, new Set(), 1).checkpoint;
  assert.equal(pauseCheckpoint(done, "blocked", "2027-01-01T00:00:00.000Z"), done);
});

// ---------------------------------------------------------------------------
// Checkpoint shape
// ---------------------------------------------------------------------------

test("a new checkpoint has the documented shape, and page size is clamped to 1..100", () => {
  const cp = fresh();
  assert.deepEqual(cp, {
    version: 1,
    sort: "downloads",
    limit: 100,
    offset: 0,
    requests: 0,
    candidates: 0,
    skipped: 0,
    duplicates: 0,
    total: null,
    started_at: NOW,
    updated_at: NOW,
    done: false,
    stop_reason: null,
  });
  assert.equal(newCheckpoint({ sort: "downloads", limit: 500, now: NOW }).limit, APTOIDE_LIST_MAX_LIMIT);
  assert.equal(newCheckpoint({ sort: "downloads", limit: 0, now: NOW }).limit, 1);
  assert.equal(newCheckpoint({ sort: "downloads", limit: NaN, now: NOW }).limit, APTOIDE_LIST_MAX_LIMIT);
  assert.equal(newCheckpoint({ sort: "downloads", limit: 25, now: NOW, offset: 300 }).offset, 300);
  assert.equal(newCheckpoint({ sort: "downloads", limit: 25, now: NOW, offset: -4 }).offset, 0);
});

test("every checkpoint the code produces survives JSON and reads back identical", () => {
  let cp = fresh();
  const seen = new Set<string>();
  const outputs: CrawlCheckpoint[] = [cp];
  for (const [next, packages] of [[244, ["a.a"]], [500, ["b.b"]], [null, ["c.c"]]] as Array<[number | null, string[]]>) {
    const step = applyPage(cp, pageOf(packages, { offset: cp.offset, next }), CAPS, LATER, seen, 1);
    for (const c of step.accepted) seen.add(c.package);
    cp = step.checkpoint;
    outputs.push(cp);
  }
  for (const item of outputs) assert.deepEqual(readCheckpoint(JSON.parse(JSON.stringify(item))), item);
  assert.equal(cp.stop_reason, "no_cursor");
});

test("a checkpoint that is not one this code wrote reads as null; nothing throws", () => {
  const good = JSON.parse(JSON.stringify(fresh()));
  assert.deepEqual(readCheckpoint(good), fresh());
  for (const value of [undefined, null, 0, "x", [], true, {}, () => 1]) assert.equal(readCheckpoint(value), null);
  const mutations: Array<[string, unknown]> = [
    ["version", 2], ["version", "1"], ["version", undefined],
    ["sort", ""], ["sort", 5], ["sort", undefined],
    ["limit", 0], ["limit", 101], ["limit", 1.5], ["limit", "100"], ["limit", undefined],
    ["offset", -1], ["offset", 1.5], ["offset", "0"], ["offset", NaN], ["offset", undefined],
    ["requests", -1], ["requests", "3"], ["requests", undefined],
    ["candidates", -1], ["candidates", 2 ** 53], ["candidates", undefined],
    ["skipped", -1], ["skipped", undefined],
    ["duplicates", -1], ["duplicates", undefined],
    ["total", -1], ["total", "10"], ["total", undefined],
    ["started_at", 5], ["started_at", undefined],
    ["updated_at", null], ["updated_at", undefined],
    ["done", "false"], ["done", undefined],
    ["stop_reason", "nonsense"], ["stop_reason", 3], ["stop_reason", "request_cap"] /* paused reason with done:false is fine; see below */,
  ];
  for (const [field, value] of mutations) {
    if (field === "stop_reason" && value === "request_cap") continue;
    const copy: Record<string, unknown> = { ...good, [field]: value };
    if (value === undefined) delete copy[field];
    assert.equal(readCheckpoint(copy), null, `${field}=${String(value)}`);
  }
  const hostile = new Proxy({}, { get() { throw new Error("boom"); }, getPrototypeOf() { throw new Error("boom"); } });
  assert.doesNotThrow(() => readCheckpoint(hostile));
  assert.equal(readCheckpoint(hostile), null);
});

test("done and stop_reason must agree: terminal reasons need done, paused reasons need not-done, done needs a reason", () => {
  const base = JSON.parse(JSON.stringify(fresh()));
  for (const reason of TERMINAL_REASONS) {
    assert.notEqual(readCheckpoint({ ...base, done: true, stop_reason: reason }), null, `terminal ${reason}`);
    assert.equal(readCheckpoint({ ...base, done: false, stop_reason: reason }), null, `terminal ${reason} but not done`);
  }
  for (const reason of PAUSED_REASONS) {
    assert.notEqual(readCheckpoint({ ...base, done: false, stop_reason: reason }), null, `paused ${reason}`);
    assert.equal(readCheckpoint({ ...base, done: true, stop_reason: reason }), null, `paused ${reason} but done`);
  }
  assert.equal(readCheckpoint({ ...base, done: true, stop_reason: null }), null);
  assert.notEqual(readCheckpoint({ ...base, done: false, stop_reason: null }), null);
  // the two reason lists do not overlap
  for (const reason of TERMINAL_REASONS) assert.equal((PAUSED_REASONS as readonly string[]).includes(reason), false);
});

test("an extra field in a saved checkpoint is dropped on read, not carried", () => {
  const read = readCheckpoint({ ...JSON.parse(JSON.stringify(fresh())), token: "secret", extra: 1 }) as unknown as Record<string, unknown>;
  assert.equal("token" in read, false);
  assert.equal("extra" in read, false);
});

// ---------------------------------------------------------------------------
// Whole crawls, simulated
// ---------------------------------------------------------------------------

/** A fake Aptoide: `total` apps ranked by downloads, a cursor that skips one entry per page (as `next` does), and a page size cap. */
function fakeServer(total: number, skipPerPage = 1) {
  const hits: number[] = [];
  const get = (offset: number, limit: number): unknown => {
    hits.push(offset);
    const size = Math.min(limit, APTOIDE_LIST_MAX_LIMIT);
    const list: unknown[] = [];
    let i = offset;
    while (list.length < size && i < total) {
      list.push(listItem(`fake.app${i}`, `App ${i}`, "2026-09-24 08:06:33", Math.max(0, total - i)));
      i += 1;
    }
    const next = i < total ? i + skipPerPage : null;
    return { datalist: { total, count: list.length, offset, limit: size, next, hidden: 0, list } };
  };
  return { get, hits };
}

function runCrawl(
  server: { get: (offset: number, limit: number) => unknown },
  caps: CrawlCaps,
  start: CrawlCheckpoint,
  seen: Set<string>,
  out: CrawlCandidate[],
  runLimit = 10000,
): CrawlCheckpoint {
  let cp = start;
  let runRequests = 0;
  while (!cp.done && runRequests < runLimit) {
    runRequests += 1;
    const page = readListPage(server.get(cp.offset, cp.limit));
    if (!page.ok) return pauseCheckpoint(cp, "bad_page", LATER);
    const step = applyPage(cp, page, caps, LATER, seen, runRequests);
    for (const c of step.accepted) {
      seen.add(c.package);
      out.push(c);
    }
    cp = step.checkpoint;
    if (cp.stop_reason === "request_cap") break;
  }
  return cp;
}

test("a crawl follows a cursor that skips entries, collects exactly the target with no repeats, and stops as reached", () => {
  const server = fakeServer(100000, 1);
  const out: CrawlCandidate[] = [];
  const cp = runCrawl(server, { maxRequests: 1000, maxCandidates: 1000, maxOffset: null }, fresh(), new Set(), out);
  assert.equal(cp.stop_reason, "target_reached");
  assert.equal(cp.done, true);
  assert.equal(out.length, 1000);
  assert.equal(new Set(out.map((c) => c.package)).size, 1000);
  assert.equal(cp.requests, 10);
  // requested offsets are the server's own cursors (100, 101 skipped-> 101, 202, ...), never 0,100,200
  assert.deepEqual(server.hits.slice(0, 4), [0, 101, 202, 303]);
  // the reported downloads are non-increasing, as `sort=downloads` promises; the crawl kept the order it was given
  const downloads = out.map((c) => c.downloads as number);
  assert.deepEqual(downloads, [...downloads].sort((a, b) => b - a));
});

test("a crawl through the whole list of a small store ends at the end of the list", () => {
  const server = fakeServer(250, 0);
  const out: CrawlCandidate[] = [];
  const cp = runCrawl(server, { maxRequests: 100, maxCandidates: 5000, maxOffset: null }, fresh(), new Set(), out);
  assert.equal(out.length, 250);
  assert.equal(cp.done, true);
  assert.ok(["no_cursor", "end_of_list"].includes(cp.stop_reason as string), String(cp.stop_reason));
});

test("a crawl split across runs by the request cap, with the checkpoint saved as JSON between them, matches one uninterrupted crawl", () => {
  const caps: CrawlCaps = { maxRequests: 3, maxCandidates: 2000, maxOffset: null };
  const oneGo: CrawlCandidate[] = [];
  const whole = runCrawl(fakeServer(100000, 1), { ...caps, maxRequests: 1000 }, fresh(), new Set(), oneGo);

  const out: CrawlCandidate[] = [];
  const seen = new Set<string>();
  let cp = fresh();
  let runs = 0;
  while (!cp.done && runs < 50) {
    runs += 1;
    const saved = JSON.stringify(cp);
    const loaded = readCheckpoint(JSON.parse(saved));
    assert.notEqual(loaded, null);
    cp = runCrawl(fakeServer(100000, 1), caps, loaded as CrawlCheckpoint, seen, out);
  }
  assert.equal(cp.done, true);
  assert.equal(runs, 7); // 20 pages, 3 per run
  assert.deepEqual(out.map((c) => c.package), oneGo.map((c) => c.package));
  assert.deepEqual([cp.requests, cp.candidates, cp.stop_reason], [whole.requests, whole.candidates, whole.stop_reason]);
});

test("a server that ignores the offset and always sends the same page stops as a stalled cursor after two requests, not a loop", () => {
  const page = envelope(REAL_ROWS.map((r) => listItem(...r)), { offset: 0, next: 100 });
  let calls = 0;
  const server = { get: () => { calls += 1; return page; } };
  const out: CrawlCandidate[] = [];
  const cp = runCrawl(server, CAPS, fresh(), new Set(), out, 20);
  // request 1 at offset 0 -> next 100; request 2 at offset 100 -> the page echoes offset 0 -> refused
  assert.equal(cp.done, true);
  assert.ok(["offset_mismatch", "cursor_stalled"].includes(cp.stop_reason as string), String(cp.stop_reason));
  assert.ok(calls <= 3, `calls=${calls}`);
  assert.equal(out.length, 12);
});

test("a server that ignores the offset and does not echo one stops as cursor_stalled", () => {
  const page = { datalist: { total: 1000, count: 2, limit: 100, next: 100, list: [listItem("a.a", "A", "u", 1), listItem("b.b", "B", "u", 2)] } };
  let calls = 0;
  const server = { get: () => { calls += 1; return page; } };
  const out: CrawlCandidate[] = [];
  const cp = runCrawl(server, CAPS, fresh(), new Set(), out, 20);
  assert.equal(cp.stop_reason, "cursor_stalled");
  assert.ok(calls <= 3, `calls=${calls}`);
});

test("an unreadable page mid-crawl pauses the crawl at the same offset and keeps what was collected", () => {
  let n = 0;
  const inner = fakeServer(100000, 1);
  const server = { get: (offset: number, limit: number) => (++n === 3 ? { html: "<html>blocked</html>" } : inner.get(offset, limit)) };
  const out: CrawlCandidate[] = [];
  const cp = runCrawl(server, { maxRequests: 100, maxCandidates: 5000, maxOffset: null }, fresh(), new Set(), out);
  assert.deepEqual([cp.done, cp.stop_reason, cp.offset, cp.requests, cp.candidates], [false, "bad_page", 202, 2, 200]);
  assert.equal(out.length, 200);
});

// ---------------------------------------------------------------------------
// The module itself
// ---------------------------------------------------------------------------

test("the module imports nothing from node: and does no I/O, time or process access", () => {
  const source = readFileSync(new URL("../lib/aptoide-crawl.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal(/\bimport\b/.test(code), false, "no imports at all");
  for (const banned of ["node:", "process.", "Date.", "new Date", "fetch(", "require(", "console."]) {
    assert.equal(code.includes(banned), false, banned);
  }
});
