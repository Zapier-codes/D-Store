import assert from "node:assert/strict";
import test from "node:test";
import {
  groupPermissions,
  permissionGroupOf,
  PERMISSION_GROUP_ORDER,
  shortPermissionName,
} from "../lib/permission-groups";

/**
 * Pure helper behind the details page's permission chips (operator-directed 2026-10-08, slice 5 of the details
 * page rework). Written, not run (standing no-testing instruction).
 */

test("the short name is the part after the last dot, upper-cased", () => {
  assert.equal(shortPermissionName("android.permission.CAMERA"), "CAMERA");
  assert.equal(shortPermissionName("internet"), "INTERNET");
  assert.equal(
    shortPermissionName("com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE"),
    "BIND_GET_INSTALL_REFERRER_SERVICE",
  );
  assert.equal(shortPermissionName("  "), "");
});

test("well-known names land in their plain-language group, with or without the android.permission prefix", () => {
  assert.equal(permissionGroupOf("CAMERA"), "camera");
  assert.equal(permissionGroupOf("android.permission.RECORD_AUDIO"), "microphone");
  assert.equal(permissionGroupOf("ACCESS_FINE_LOCATION"), "location");
  assert.equal(permissionGroupOf("WRITE_EXTERNAL_STORAGE"), "storage");
  assert.equal(permissionGroupOf("READ_MEDIA_IMAGES"), "storage");
  assert.equal(permissionGroupOf("INTERNET"), "network");
  assert.equal(permissionGroupOf("BLUETOOTH_CONNECT"), "nearby");
  assert.equal(permissionGroupOf("READ_CONTACTS"), "contacts");
  assert.equal(permissionGroupOf("READ_CALENDAR"), "calendar");
  assert.equal(permissionGroupOf("READ_SMS"), "phone");
  assert.equal(permissionGroupOf("POST_NOTIFICATIONS"), "notifications");
  assert.equal(permissionGroupOf("REQUEST_INSTALL_PACKAGES"), "install");
  assert.equal(permissionGroupOf("FOREGROUND_SERVICE_DATA_SYNC"), "background");
  assert.equal(permissionGroupOf("BODY_SENSORS"), "sensors");
});

test("an unknown name is never dropped and never guessed into a group: it is Other", () => {
  assert.equal(permissionGroupOf("com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE"), "other");
  assert.equal(permissionGroupOf("SOMETHING_NEW"), "other");
  assert.equal(permissionGroupOf(""), "other");
});

test("groups come out in the fixed display order, Other last, each with its raw names", () => {
  const groups = groupPermissions(["INTERNET", "CAMERA", "SOMETHING_NEW", "ACCESS_NETWORK_STATE"]);
  assert.deepEqual(
    groups.map((g) => g.id),
    ["camera", "network", "other"],
  );
  assert.deepEqual(groups[1].items, ["INTERNET", "ACCESS_NETWORK_STATE"]);
  assert.deepEqual(groups[2].items, ["SOMETHING_NEW"]);
  assert.equal(PERMISSION_GROUP_ORDER[PERMISSION_GROUP_ORDER.length - 1].id, "other");
});

test("duplicates are listed once, blanks are skipped, and every real name survives", () => {
  const input = ["INTERNET", "INTERNET", " ", "", "CAMERA"];
  const groups = groupPermissions(input);
  const all = groups.flatMap((g) => g.items);
  assert.deepEqual(all.sort(), ["CAMERA", "INTERNET"]);
});

test("an empty or missing list gives no groups (the caller says it requests none)", () => {
  assert.deepEqual(groupPermissions([]), []);
  assert.deepEqual(groupPermissions(null), []);
  assert.deepEqual(groupPermissions(undefined), []);
});
