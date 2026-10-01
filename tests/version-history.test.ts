import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CHANGELOG_LENGTH,
  MAX_DOWNLOAD_URL_LENGTH,
  MAX_VERSIONS_SCANNED,
  MAX_VERSION_HISTORY,
  MAX_VERSION_NAME_LENGTH,
  decideDownload,
  diffPermissions,
  readVersionHistory,
  type VersionEntry,
} from "../lib/version-history";

// Leaf 5.c.v.zi.
const MB = 1024 * 1024;
const full = {
  release_id: 7,
  version_name: "2.1.0",
  download_url: "https://example.invalid/a.apk",
  sha256: "ab",
  size_bytes: 5 * MB,
  signing_fingerprint: "cd",
  changelog: "  Fixes.  ",
  compatibility: { min_sdk: 24 },
  rollout: { percentage: 40, status: "active" },
};
const EMPTY = { entries: [], omitted: 0 };
// Not a list: none of these may throw or produce entries.
const NOT_LISTS: unknown[] = [undefined, null, NaN, 0, 1, "1.0", true, {}, () => 1, Symbol("x")];

test("a full entry is read field by field, and carries no checksum, fingerprint or date", () => {
  const { entries, omitted } = readVersionHistory([full]);
  assert.equal(omitted, 0);
  assert.deepEqual(entries, [
    {
      version_name: "2.1.0",
      changelog: "Fixes.",
      size_mb: 5,
      rollout_percentage: 40,
      rollout_status: "active",
      status: "available",
      download_url: "https://example.invalid/a.apk",
      permissions: [],
    },
  ]);
  assert.deepEqual(Object.keys(entries[0]).sort(), [
    "changelog",
    "download_url",
    "permissions",
    "rollout_percentage",
    "rollout_status",
    "size_mb",
    "status",
    "version_name",
  ]);
});

test("anything that is not an array is an empty history and never throws", () => {
  for (const input of NOT_LISTS) assert.deepEqual(readVersionHistory(input), EMPTY);
  assert.deepEqual(readVersionHistory([]), EMPTY);
});

test("the index's order is kept, never re-sorted", () => {
  const names = ["1.0.9", "2.0.0", "1.0.10"].map((version_name) => ({ version_name }));
  assert.deepEqual(readVersionHistory(names).entries.map((e) => e.version_name), ["1.0.9", "2.0.0", "1.0.10"]);
});

test("an entry that is not an object, or has no usable version_name, is skipped and counted", () => {
  const input = [
    { version_name: "3.0" },
    null,
    undefined,
    "2.0",
    42,
    [],
    {},
    { version_name: "" },
    { version_name: "   " },
    { version_name: 2 },
    { version_name: null },
    { version_name: "1.0" },
  ];
  const { entries, omitted } = readVersionHistory(input);
  assert.deepEqual(entries.map((e) => e.version_name), ["3.0", "1.0"]);
  assert.equal(omitted, 10);
  assert.equal(entries.length + omitted, input.length);
});

test("version_name is trimmed and cut to the limit", () => {
  const [a, b] = readVersionHistory([{ version_name: "  1.2  " }, { version_name: "v".repeat(500) }]).entries;
  assert.equal(a.version_name, "1.2");
  assert.equal(b.version_name.length, MAX_VERSION_NAME_LENGTH);
});

test("changelog: trimmed, cut to the limit, and null when missing, blank or not a string", () => {
  const notes = (changelog: unknown) => readVersionHistory([{ version_name: "1", changelog }]).entries[0].changelog;
  assert.equal(notes("  hello "), "hello");
  assert.equal(notes("x".repeat(MAX_CHANGELOG_LENGTH + 50))?.length, MAX_CHANGELOG_LENGTH);
  for (const bad of [undefined, null, "", "  \n ", 5, {}, [], true]) assert.equal(notes(bad), null);
});

test("size_mb: megabytes to one decimal, and null for anything unusable", () => {
  const size = (size_bytes: unknown) => readVersionHistory([{ version_name: "1", size_bytes }]).entries[0].size_mb;
  assert.equal(size(5 * MB), 5);
  assert.equal(size(1.26 * MB), 1.3);
  assert.equal(size(100), null); // rounds to 0 MB: unknown, not "0 MB"
  for (const bad of [undefined, null, 0, -1, NaN, Infinity, -Infinity, "5", {}, [], true]) assert.equal(size(bad), null);
});

test("rollout: an absent or non-object block is fully available, as 5.c.iv.zo reads an older index", () => {
  for (const rollout of [undefined, null, "active", 50, [], true]) {
    const e = readVersionHistory([{ version_name: "1", rollout }]).entries[0];
    assert.equal(e.rollout_percentage, 100);
    assert.equal(e.rollout_status, "complete");
  }
});

test("rollout: a valid block is kept, the percentage is clamped, and bad parts fall to safe values", () => {
  const roll = (rollout: unknown) => {
    const e = readVersionHistory([{ version_name: "1", rollout }]).entries[0];
    return [e.rollout_percentage, e.rollout_status];
  };
  assert.deepEqual(roll({ percentage: 10, status: "halted" }), [10, "halted"]);
  assert.deepEqual(roll({ percentage: 100, status: "complete" }), [100, "complete"]);
  assert.deepEqual(roll({ percentage: 250, status: "active" }), [100, "active"]);
  assert.deepEqual(roll({ percentage: -5, status: "halted" }), [0, "halted"]);
  assert.deepEqual(roll({ percentage: NaN, status: "active" }), [100, "active"]);
  assert.deepEqual(roll({ percentage: "50", status: "active" }), [100, "active"]);
  assert.deepEqual(roll({ percentage: 30, status: "bogus" }), [30, "active"]);
  assert.deepEqual(roll({ percentage: 100, status: 7 }), [100, "complete"]);
  assert.deepEqual(roll({}), [100, "complete"]);
  assert.deepEqual(roll({ status: "halted" }), [100, "halted"]);
});

test("the list is capped, and everything left out is counted", () => {
  const input = Array.from({ length: MAX_VERSION_HISTORY + 25 }, (_, i) => ({ version_name: `v${i}` }));
  const { entries, omitted } = readVersionHistory(input);
  assert.equal(entries.length, MAX_VERSION_HISTORY);
  assert.equal(entries[0].version_name, "v0");
  assert.equal(entries[MAX_VERSION_HISTORY - 1].version_name, `v${MAX_VERSION_HISTORY - 1}`);
  assert.equal(omitted, 25);
});

test("malformed entries do not use up the cap", () => {
  const input = [...Array.from({ length: 30 }, () => null), ...Array.from({ length: MAX_VERSION_HISTORY }, (_, i) => ({ version_name: `v${i}` }))];
  const { entries, omitted } = readVersionHistory(input);
  assert.equal(entries.length, MAX_VERSION_HISTORY);
  assert.equal(omitted, 30);
});

test("a huge array is scanned only up to the limit, and the rest is counted as omitted", () => {
  const total = MAX_VERSIONS_SCANNED + 5000;
  const input = new Array(total).fill(null);
  const { entries, omitted } = readVersionHistory(input);
  assert.equal(entries.length, 0);
  assert.equal(omitted, total);
});

test("entries past the scan limit are never looked at, even when they are valid", () => {
  const input = [...new Array(MAX_VERSIONS_SCANNED).fill(null), { version_name: "late" }];
  const { entries, omitted } = readVersionHistory(input);
  assert.equal(entries.length, 0);
  assert.equal(omitted, input.length);
});

test("a getter or proxy that throws is a skipped entry, not a failure", () => {
  const boom = { get version_name(): string { throw new Error("boom"); } };
  const proxy = new Proxy({}, { get() { throw new Error("nope"); }, has() { throw new Error("nope"); } });
  const { entries, omitted } = readVersionHistory([boom, proxy, { version_name: "1.0" }]);
  assert.deepEqual(entries.map((e) => e.version_name), ["1.0"]);
  assert.equal(omitted, 2);
});

test("the input is not mutated", () => {
  const input = [{ ...full }, { version_name: "0.9" }];
  const before = JSON.stringify(input);
  readVersionHistory(input);
  assert.equal(JSON.stringify(input), before);
});

// Leaf 5.c.vii.zo: the per-entry lifecycle status, distinct from the rollout ramp.
test("each entry carries the release's lifecycle status, read safely", () => {
  const status = (value: unknown) => readVersionHistory([{ version_name: "1.0", status: value }]).entries[0].status;
  assert.equal(status("available"), "available");
  assert.equal(status("halted"), "halted");
  assert.equal(status("pulled"), "pulled");
  for (const bad of [undefined, null, 7, {}, [], "HALTED", " pulled", "held", ""]) assert.equal(status(bad), "available");
});

test("the lifecycle status and the rollout status do not affect each other", () => {
  const { entries } = readVersionHistory([
    { version_name: "2.0", status: "available", rollout: { percentage: 10, status: "halted" } },
    { version_name: "1.0", status: "pulled", rollout: { percentage: 100, status: "complete" } },
  ]);
  assert.deepEqual(
    entries.map((e) => [e.status, e.rollout_status]),
    [["available", "halted"], ["pulled", "complete"]],
  );
});

// Leaf 5.c.ii.zo: each release's own download URL, kept only when it is a plain https URL.
const url = (download_url: unknown) => readVersionHistory([{ version_name: "1", download_url }]).entries[0].download_url;

test("download_url: a plain https URL is kept, trimmed, as the parser writes it", () => {
  assert.equal(url("https://zealot.example/download/releases/456"), "https://zealot.example/download/releases/456");
  assert.equal(url("  https://zealot.example/a.apk \n"), "https://zealot.example/a.apk");
  assert.equal(url("https://zealot.example:8443/a.apk?x=1#f"), "https://zealot.example:8443/a.apk?x=1#f");
  assert.equal(url("https://Zealot.Example/a"), "https://zealot.example/a"); // host is lower-cased by the parser
});

test("download_url: anything that is not a plain https URL is null", () => {
  const bad: unknown[] = [
    undefined, null, "", "   ", 5, {}, [], true, () => 1,
    "http://zealot.example/a.apk",
    "HTTPS://zealot.example/a.apk", // literal, case-sensitive prefix
    "//zealot.example/a.apk",
    "/download/releases/456",
    "zealot.example/a.apk",
    "javascript:alert(1)",
    "data:text/html,x",
    "ftp://zealot.example/a.apk",
    "https:zealot.example/a.apk",
    "https://",
    "https://user:pw@zealot.example/a.apk",
    "https://user@zealot.example/a.apk",
    "https://zeal ot.example/a.apk",
    "https://zealot.example/a\tapk",
    "https://zealot.example/a\napk",
    "https://zealot.example/a\u0000apk",
    "https://zealot.example/a\u007fapk",
    "https://[bad/a.apk",
  ];
  for (const value of bad) assert.equal(url(value), null, String(value));
});

test("download_url: a length over the limit is null; the limit itself is kept", () => {
  const base = "https://zealot.example/";
  assert.equal(url(base + "a".repeat(MAX_DOWNLOAD_URL_LENGTH - base.length)), base + "a".repeat(MAX_DOWNLOAD_URL_LENGTH - base.length));
  assert.equal(url(base + "a".repeat(MAX_DOWNLOAD_URL_LENGTH - base.length + 1)), null);
});

test("download_url: what is returned is what the parser reads, so a backslash cannot move the host", () => {
  const out = url("https://good.example\\@evil.example/a.apk");
  if (out !== null) assert.equal(new URL(out).hostname, "good.example");
});

test("an entry with a bad download_url is still an entry", () => {
  const { entries, omitted } = readVersionHistory([{ version_name: "1", download_url: "javascript:alert(1)" }]);
  assert.equal(omitted, 0);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].download_url, null);
});

const entry = (over: Partial<VersionEntry> = {}): VersionEntry => ({
  version_name: "1.0",
  changelog: null,
  size_mb: null,
  rollout_percentage: 100,
  rollout_status: "complete",
  status: "available",
  download_url: "https://zealot.example/a.apk",
  permissions: [],
  ...over,
});

test("decideDownload: an available, fully rolled-out release with a link is offered", () => {
  assert.deepEqual(decideDownload(entry()), { offered: true, url: "https://zealot.example/a.apk" });
});

test("decideDownload: a pulled or halted release is never offered, whatever else is true", () => {
  assert.deepEqual(decideDownload(entry({ status: "pulled" })), { offered: false, reason: "pulled" });
  assert.deepEqual(decideDownload(entry({ status: "halted" })), { offered: false, reason: "halted" });
  assert.deepEqual(decideDownload(entry({ status: "pulled", rollout_status: "active", rollout_percentage: 10, download_url: null })), {
    offered: false,
    reason: "pulled",
  });
});

test("decideDownload: a release still rolling out (or paused mid-rollout, or under 100%) is not offered", () => {
  assert.deepEqual(decideDownload(entry({ rollout_status: "active", rollout_percentage: 40 })), { offered: false, reason: "rolling_out" });
  assert.deepEqual(decideDownload(entry({ rollout_status: "halted", rollout_percentage: 40 })), { offered: false, reason: "rolling_out" });
  assert.deepEqual(decideDownload(entry({ rollout_status: "complete", rollout_percentage: 99 })), { offered: false, reason: "rolling_out" });
  assert.deepEqual(decideDownload(entry({ rollout_status: "active", rollout_percentage: 100 })), { offered: false, reason: "rolling_out" });
});

test("decideDownload: an available, complete release with no usable link says so", () => {
  assert.deepEqual(decideDownload(entry({ download_url: null })), { offered: false, reason: "no_link" });
});

test("decideDownload agrees with the reader end to end", () => {
  const { entries } = readVersionHistory([
    { version_name: "3", download_url: "https://zealot.example/3" },
    { version_name: "2", download_url: "https://zealot.example/2", status: "pulled" },
    { version_name: "1", download_url: "http://zealot.example/1" },
  ]);
  assert.deepEqual(entries.map((e) => decideDownload(e)), [
    { offered: true, url: "https://zealot.example/3" },
    { offered: false, reason: "pulled" },
    { offered: false, reason: "no_link" },
  ]);
});

test("permissions come from compatibility.permissions: strings only, prefix dropped, else empty", () => {
  const read = (compatibility: unknown) =>
    readVersionHistory([{ ...full, compatibility }]).entries[0].permissions;
  assert.deepEqual(
    read({ permissions: ["android.permission.CAMERA", "INTERNET", 7, null, {}] }),
    ["CAMERA", "INTERNET"],
  );
  assert.deepEqual(read({ permissions: "CAMERA" }), []);
  assert.deepEqual(read({}), []);
  assert.deepEqual(read(null), []);
  assert.deepEqual(read("x"), []);
  assert.deepEqual(readVersionHistory([full]).entries[0].permissions, []);
});

test("diffPermissions: added permissions only; an empty or missing list on either side is unknown, so no alert", () => {
  assert.deepEqual(diffPermissions(["CAMERA", "INTERNET"], ["INTERNET"]), ["CAMERA"]);
  assert.deepEqual(diffPermissions(["INTERNET"], ["INTERNET", "CAMERA"]), []); // removed is not an alert
  assert.deepEqual(diffPermissions(["INTERNET"], ["INTERNET"]), []);
  assert.deepEqual(diffPermissions(["CAMERA", "INTERNET"], []), []); // older release never read: unknown, not "none"
  assert.deepEqual(diffPermissions([], ["INTERNET"]), []);
  assert.deepEqual(diffPermissions([], []), []);
  assert.deepEqual(diffPermissions(undefined, ["INTERNET"]), []);
  assert.deepEqual(diffPermissions(["CAMERA"], undefined), []);
});
