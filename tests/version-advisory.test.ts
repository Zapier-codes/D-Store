import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_ADVISORY_NAME_LENGTH, decideAdvisory, readVersionStatus, type VersionStatus } from "../lib/version-advisory";

// Leaf 5.c.vii.zi.
const BANNED = /security|vulnerab/i;
// Not a valid status: every one of these must read as "available" and never throw.
const NOT_STATUSES: unknown[] = [
  undefined,
  null,
  NaN,
  0,
  1,
  true,
  {},
  [],
  ["halted"],
  () => "halted",
  Symbol("halted"),
  "",
  " halted",
  "halted ",
  "HALTED",
  "Pulled",
  "held",
  "complete",
  "active",
  "yanked",
  "available ",
];

test("the three real statuses read as themselves", () => {
  assert.equal(readVersionStatus("available"), "available");
  assert.equal(readVersionStatus("halted"), "halted");
  assert.equal(readVersionStatus("pulled"), "pulled");
});

test("anything else reads as available and never throws", () => {
  for (const value of NOT_STATUSES) {
    assert.equal(readVersionStatus(value), "available", `value: ${String(typeof value)}`);
  }
});

test("a proxy or throwing getter cannot make the reader throw", () => {
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error("boom");
      },
    },
  );
  assert.equal(readVersionStatus(hostile), "available");
});

test("available has no advisory, whatever the name", () => {
  assert.equal(decideAdvisory("available", "1.0"), null);
  assert.equal(decideAdvisory("available", null), null);
});

test("halted names the version and says paused, with no cause", () => {
  const advisory = decideAdvisory("halted", "2.1.0");
  assert.ok(advisory);
  assert.equal(advisory.kind, "halted");
  assert.match(advisory.title, /paused/);
  assert.match(advisory.message, /version 2\.1\.0/);
  assert.match(advisory.message, /paused/);
  assert.doesNotMatch(advisory.title + advisory.message, BANNED);
});

test("pulled names the version and says withdrawn, and says not to install it", () => {
  const advisory = decideAdvisory("pulled", "2.1.0");
  assert.ok(advisory);
  assert.equal(advisory.kind, "pulled");
  assert.match(advisory.title, /withdrawn/);
  assert.match(advisory.message, /version 2\.1\.0/);
  assert.match(advisory.message, /should not be installed/);
  assert.doesNotMatch(advisory.title + advisory.message, BANNED);
});

test("the two kinds are told apart", () => {
  const halted = decideAdvisory("halted", "1");
  const pulled = decideAdvisory("pulled", "1");
  assert.ok(halted && pulled);
  assert.notEqual(halted.title, pulled.title);
  assert.notEqual(halted.message, pulled.message);
});

test("a blank, missing or non-string name falls to wording without one", () => {
  const names: unknown[] = [null, undefined, "", "   ", "\n\t", 3, {}, [], true];
  for (const status of ["halted", "pulled"] as const) {
    for (const name of names) {
      const advisory = decideAdvisory(status, name as string | null);
      assert.ok(advisory, `${status} ${String(typeof name)}`);
      assert.match(advisory.message, /the newest version of this app/);
      assert.doesNotMatch(advisory.message, /version undefined|version null|version \./);
    }
  }
});

test("a name is trimmed and cut to the maximum length", () => {
  const trimmed = decideAdvisory("halted", "  1.2.3  ");
  assert.ok(trimmed);
  assert.match(trimmed.message, /paused version 1\.2\.3\. Hold/);

  const long = "x".repeat(MAX_ADVISORY_NAME_LENGTH + 40);
  const cut = decideAdvisory("pulled", long);
  assert.ok(cut);
  assert.ok(cut.message.includes("x".repeat(MAX_ADVISORY_NAME_LENGTH)));
  assert.ok(!cut.message.includes("x".repeat(MAX_ADVISORY_NAME_LENGTH + 1)));
});

test("a status outside the type is treated as available, not an error", () => {
  for (const value of NOT_STATUSES) {
    assert.equal(decideAdvisory(value as VersionStatus, "1.0"), null);
  }
});

test("the same input gives the same output", () => {
  assert.deepEqual(decideAdvisory("halted", "3.0"), decideAdvisory("halted", "3.0"));
  assert.deepEqual(decideAdvisory("pulled", null), decideAdvisory("pulled", null));
});
