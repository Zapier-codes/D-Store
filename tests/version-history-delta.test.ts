import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DELTA_PATCHES,
  MAX_VERSION_CODE_LENGTH,
  readDeltaPatches,
  readVersionHistory,
} from "../lib/version-history";
import { formatBytes, updateDeltaLabel } from "../lib/play-ports";

// Parity card Z-P13 — the web data half of the delta applier.

const HEX = "a".repeat(64);
const patch = {
  from_version_code: "41",
  download_url: "https://store.example.invalid/download/releases/9/delta?from=41",
  size: 378,
  sha256: HEX,
  from_sha256: "b".repeat(64),
  to_sha256: "c".repeat(64),
  format: "GFbFv1_0",
};

test("readDeltaPatches keeps a usable patch and reads its size", () => {
  const out = readDeltaPatches([patch]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], {
    from_version_code: "41",
    download_url: "https://store.example.invalid/download/releases/9/delta?from=41",
    size_bytes: 378,
    sha256: HEX,
  });
});

test("readDeltaPatches drops a patch missing a base or a real https URL", () => {
  const out = readDeltaPatches([
    { ...patch, from_version_code: "  " },
    { ...patch, from_version_code: null },
    { ...patch, download_url: "http://insecure.invalid/p" },
    { ...patch, download_url: "ftp://x.invalid/p" },
    { ...patch, download_url: null },
    patch,
  ]);
  assert.equal(out.length, 1);
});

test("readDeltaPatches trims the version code and bounds it", () => {
  assert.equal(readDeltaPatches([{ ...patch, from_version_code: " 41 " }])[0].from_version_code, "41");
  assert.deepEqual(readDeltaPatches([{ ...patch, from_version_code: "x".repeat(MAX_VERSION_CODE_LENGTH + 1) }]), []);
});

test("readDeltaPatches reads a non-hex sha256 as null, never as a value", () => {
  assert.equal(readDeltaPatches([{ ...patch, sha256: "abc" }])[0].sha256, null);
  assert.equal(readDeltaPatches([{ ...patch, sha256: HEX.toUpperCase() }])[0].sha256, null);
  assert.equal(readDeltaPatches([{ ...patch, sha256: null }])[0].sha256, null);
});

test("readDeltaPatches reads a missing or non-positive size as null", () => {
  assert.equal(readDeltaPatches([{ ...patch, size: undefined }])[0].size_bytes, null);
  assert.equal(readDeltaPatches([{ ...patch, size: 0 }])[0].size_bytes, null);
  assert.equal(readDeltaPatches([{ ...patch, size: -5 }])[0].size_bytes, null);
  assert.equal(readDeltaPatches([{ ...patch, size: 12.7 }])[0].size_bytes, 13);
});

test("readDeltaPatches caps the list and tolerates anything else", () => {
  const many = Array.from({ length: MAX_DELTA_PATCHES + 5 }, () => patch);
  assert.equal(readDeltaPatches(many).length, MAX_DELTA_PATCHES);
  for (const bad of [undefined, null, 0, "x", {}, true, () => 1]) {
    assert.deepEqual(readDeltaPatches(bad), []);
  }
});

test("readVersionHistory carries delta_patches through, empty when absent", () => {
  const { entries } = readVersionHistory([
    { version_name: "2.0", delta_patches: [patch] },
    { version_name: "1.0" },
  ]);
  assert.equal(entries[0].delta_patches?.length, 1);
  assert.deepEqual(entries[1].delta_patches, []);
});

test("updateDeltaLabel names the base version and the size, or nothing", () => {
  const withSize = updateDeltaLabel(true, { from_version_code: "41", size_bytes: 378, sha256: HEX });
  assert.equal(withSize, "Update delta from version 41, 378 B");
  const noSize = updateDeltaLabel(true, { from_version_code: "41", size_bytes: null, sha256: null });
  assert.equal(noSize, "Update delta from version 41");
});

test("updateDeltaLabel is null when there is no delta, a blank base, or no patch", () => {
  assert.equal(updateDeltaLabel(false, { from_version_code: "41", size_bytes: 1, sha256: null }), null);
  assert.equal(updateDeltaLabel(true, { from_version_code: "  ", size_bytes: 1, sha256: null }), null);
  assert.equal(updateDeltaLabel(true, null), null);
  assert.equal(updateDeltaLabel(true, undefined), null);
});

test("formatBytes keeps a small patch a real figure", () => {
  assert.equal(formatBytes(378), "378 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(1024 * 1024 * 3), "3 MB");
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(-1), "0 B");
});
