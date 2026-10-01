import { test } from "node:test";
import assert from "node:assert/strict";
import { isModerationPath, moderatorDeniedResponse, requireModeratorRequest, applyModerationHeaders } from "../lib/moderator-gate";
import { isAdminPath } from "../lib/admin-auth";
import { moderatorTokenDigest } from "../lib/moderator-auth";
import { NextResponse } from "next/server";

// Leaf 3.c.vi.zo.
test("isModerationPath covers exactly the two prefixes", () => {
  for (const p of ["/moderation", "/moderation/", "/moderation/reports", "/api/moderation", "/api/moderation/ping", "/api/moderation/reports/1"]) {
    assert.equal(isModerationPath(p), true, p);
  }
  for (const p of ["/", "/moderator", "/moderations", "/api/moderations", "/api/moderator/x", "/admin", "/api/admin/x", "/app/moderation", "/Moderation", "//moderation", "/x/moderation"]) {
    assert.equal(isModerationPath(p), false, p);
  }
});

test("the moderation and admin prefixes are disjoint", () => {
  for (const p of ["/moderation", "/moderation/a", "/api/moderation", "/api/moderation/a"]) assert.equal(isAdminPath(p), false, p);
  for (const p of ["/admin", "/admin/a", "/api/admin", "/api/admin/a"]) assert.equal(isModerationPath(p), false, p);
});

test("denied responses are no-store and noindex, and only a 401 carries the challenge", async () => {
  const r401 = moderatorDeniedResponse({ ok: false, status: 401, message: "Authentication required." });
  assert.equal(r401.status, 401);
  assert.match(r401.headers.get("www-authenticate") ?? "", /^Basic realm="D-Store moderation"/);
  const r403 = moderatorDeniedResponse({ ok: false, status: 403, message: "x" });
  assert.equal(r403.status, 403);
  assert.equal(r403.headers.get("www-authenticate"), null);
  const before = process.env.MODERATOR_TOKENS;
  delete process.env.MODERATOR_TOKENS;
  const realError = console.error;
  const logged: string[] = [];
  console.error = (m: unknown) => void logged.push(String(m));
  try {
    const r503 = moderatorDeniedResponse({ ok: false, status: 503, message: "x" });
    moderatorDeniedResponse({ ok: false, status: 503, message: "x" }); // same reason: not logged twice
    assert.equal(r503.status, 503);
    assert.equal(r503.headers.get("www-authenticate"), null);
    assert.equal(logged.length, 1);
    assert.match(logged[0], /unset or empty/);
    process.env.MODERATOR_TOKENS = "{ typo";
    moderatorDeniedResponse({ ok: false, status: 503, message: "x" });
    assert.equal(logged.length, 2);
    assert.match(logged[1], /not valid JSON/);
  } finally {
    console.error = realError;
    if (before === undefined) delete process.env.MODERATOR_TOKENS;
    else process.env.MODERATOR_TOKENS = before;
  }
  for (const r of [r401, r403]) {
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow");
  }
});

test("requireModeratorRequest returns the id on success and a response on failure", async () => {
  const token = "Qw3rTy9uIo0pAs1dFg2hJk4lZx5cVb6n";
  const before = process.env.MODERATOR_TOKENS;
  process.env.MODERATOR_TOKENS = JSON.stringify([{ id: "alice", sha256: await moderatorTokenDigest(token) }]);
  try {
    const good = await requireModeratorRequest(new Request("https://x.invalid/api/moderation/ping", { headers: { authorization: "Basic " + Buffer.from(`alice:${token}`).toString("base64") } }));
    assert.deepEqual(good, { ok: true, moderator: "alice" });
    const bad = await requireModeratorRequest(new Request("https://x.invalid/api/moderation/ping"));
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.response.status, 401);
  } finally {
    if (before === undefined) delete process.env.MODERATOR_TOKENS;
    else process.env.MODERATOR_TOKENS = before;
  }
});

test("applyModerationHeaders sets both headers", () => {
  const r = applyModerationHeaders(NextResponse.json({}));
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow");
});
