import { test } from "node:test";
import assert from "node:assert/strict";
import { isThirdParty, isVerifiedDeveloper, sourceName, thirdPartyLabel } from "../lib/trust";

// Leaf 5.d.iv.zi. `zealot` is the first-party origin; every other origin is third-party.
const zealot = { origin: "zealot" as const };
const aptoide = { origin: "aptoide" as const };

test("isThirdParty: only zealot is first-party", () => {
  assert.equal(isThirdParty(zealot), false);
  assert.equal(isThirdParty(aptoide), true);
});

test("thirdPartyLabel: the exact wording for Aptoide, nothing for first-party", () => {
  assert.equal(thirdPartyLabel(aptoide), "Third-party (via Aptoide)");
  assert.equal(thirdPartyLabel(zealot), null);
});

test("sourceName", () => {
  assert.equal(sourceName(aptoide), "Aptoide");
  assert.equal(sourceName(zealot), "Zealot");
});

test("isVerifiedDeveloper: the flag counts only for a first-party app", () => {
  assert.equal(isVerifiedDeveloper({ ...zealot, developer_verified: true }), true);
  assert.equal(isVerifiedDeveloper({ ...zealot, developer_verified: false }), false);
  assert.equal(isVerifiedDeveloper({ ...aptoide, developer_verified: true }), false);
});
