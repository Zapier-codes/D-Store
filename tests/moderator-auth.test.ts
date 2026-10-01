import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MODERATOR_MAX_ENTRIES,
  MODERATOR_TOKEN_MAX_LENGTH,
  MODERATOR_TOKEN_MIN_LENGTH,
  checkModeratorAuth,
  moderatorTokenDigest,
  readModeratorConfig,
} from "../lib/moderator-auth";

// Leaf 3.c.vi.zi.
const TOKEN_A = "Aq3k9Zp0Lm2Xv7Bn5Rt8Yc1Wd4Hf6Jg+"; // 33 characters, generated-looking
const TOKEN_B = "Zz9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4j";
assert.ok(TOKEN_A.length >= MODERATOR_TOKEN_MIN_LENGTH && TOKEN_B.length >= MODERATOR_TOKEN_MIN_LENGTH);

const HOST = "store.example.invalid";

async function configFor(...pairs: [string, string][]): Promise<Record<string, string>> {
  const entries = [];
  for (const [id, token] of pairs) entries.push({ id, sha256: await moderatorTokenDigest(token) });
  return { MODERATOR_TOKENS: JSON.stringify(entries) };
}

function basic(user: string, password: string): string {
  return "Basic " + Buffer.from(`${user}:${password}`, "utf8").toString("base64");
}

function req(over: Record<string, string> = {}): Headers {
  return new Headers({ host: HOST, ...over });
}

const OK_ENV = () => configFor(["alice", TOKEN_A], ["bob.2", TOKEN_B]);
const DENIED_401 = { ok: false, status: 401, message: "Authentication required." };

// ---- readModeratorConfig ----

test("unset, blank and empty-array config are unconfigured", () => {
  assert.deepEqual(readModeratorConfig({}), { status: "unconfigured" });
  assert.deepEqual(readModeratorConfig({ MODERATOR_TOKENS: "" }), { status: "unconfigured" });
  assert.deepEqual(readModeratorConfig({ MODERATOR_TOKENS: "  \n " }), { status: "unconfigured" });
  assert.deepEqual(readModeratorConfig({ MODERATOR_TOKENS: "[]" }), { status: "unconfigured" });
});

test("a well-formed config parses to its entries in order", async () => {
  const env = await OK_ENV();
  const config = readModeratorConfig(env);
  assert.equal(config.status, "ok");
  if (config.status !== "ok") return;
  assert.deepEqual(
    config.moderators.map((m) => m.id),
    ["alice", "bob.2"],
  );
  assert.equal(config.moderators[0].sha256, await moderatorTokenDigest(TOKEN_A));
});

test("extra keys on an entry are ignored and not carried", async () => {
  const sha256 = await moderatorTokenDigest(TOKEN_A);
  const config = readModeratorConfig({ MODERATOR_TOKENS: JSON.stringify([{ id: "alice", sha256, note: "Alice, backup" }]) });
  assert.deepEqual(config, { status: "ok", moderators: [{ id: "alice", sha256 }] });
});

test("anything unparseable or the wrong shape is invalid, never ok and never a throw", async () => {
  const good = await moderatorTokenDigest(TOKEN_A);
  const bad: unknown[] = [
    "not json",
    "{",
    "{}",
    '"alice"',
    "null",
    "42",
    "true",
    JSON.stringify([null]),
    JSON.stringify(["alice"]),
    JSON.stringify([[]]),
    JSON.stringify([{}]),
    JSON.stringify([{ id: "alice" }]),
    JSON.stringify([{ sha256: good }]),
    JSON.stringify([{ id: 5, sha256: good }]),
    JSON.stringify([{ id: "alice", sha256: 5 }]),
    JSON.stringify([{ id: "alice", sha256: good.slice(1) }]), // 63 hex
    JSON.stringify([{ id: "alice", sha256: good + "0" }]), // 65 hex
    JSON.stringify([{ id: "alice", sha256: good.toUpperCase() }]), // lowercase only
    JSON.stringify([{ id: "alice", sha256: good.replace(/./, "g") }]), // not hex
    JSON.stringify([{ id: "alice", sha256: " " + good.slice(1) }]),
  ];
  for (const value of bad) {
    const config = readModeratorConfig({ MODERATOR_TOKENS: value as string });
    assert.equal(config.status, "invalid", String(value));
  }
});

test("id pattern: ^[a-z0-9][a-z0-9._-]{1,31}$", async () => {
  const sha256 = await moderatorTokenDigest(TOKEN_A);
  const status = (id: unknown) => readModeratorConfig({ MODERATOR_TOKENS: JSON.stringify([{ id, sha256 }]) }).status;
  for (const id of ["ab", "a1", "0z", "a.b", "a_b", "a-b", "alice", "a".repeat(32)]) assert.equal(status(id), "ok", id);
  for (const id of ["", "a", "Alice", "ALICE", "-ab", ".ab", "_ab", "a b", "a:b", "a/b", "a@b", "é1", "a".repeat(33), "ab\n", " ab"]) {
    assert.equal(status(id), "invalid", JSON.stringify(id));
  }
});

test("a duplicate id or a duplicate digest invalidates the whole config", async () => {
  const a = await moderatorTokenDigest(TOKEN_A);
  const b = await moderatorTokenDigest(TOKEN_B);
  const dupId = readModeratorConfig({ MODERATOR_TOKENS: JSON.stringify([{ id: "alice", sha256: a }, { id: "alice", sha256: b }]) });
  const dupDigest = readModeratorConfig({ MODERATOR_TOKENS: JSON.stringify([{ id: "alice", sha256: a }, { id: "bob", sha256: a }]) });
  assert.equal(dupId.status, "invalid");
  assert.equal(dupDigest.status, "invalid");
});

test("20 entries are accepted and 21 are not", async () => {
  const make = async (n: number) => {
    const entries = [];
    for (let i = 0; i < n; i++) entries.push({ id: `mod${i}`, sha256: await moderatorTokenDigest(`${TOKEN_A}${i}`) });
    return { MODERATOR_TOKENS: JSON.stringify(entries) };
  };
  assert.equal(MODERATOR_MAX_ENTRIES, 20);
  assert.equal(readModeratorConfig(await make(20)).status, "ok");
  assert.equal(readModeratorConfig(await make(21)).status, "invalid");
});

test("an oversized value is invalid", () => {
  assert.equal(readModeratorConfig({ MODERATOR_TOKENS: "[" + " ".repeat(9000) + "]" }).status, "invalid");
});

test("one bad entry among good ones makes the whole config invalid", async () => {
  const good = await moderatorTokenDigest(TOKEN_A);
  const config = readModeratorConfig({
    MODERATOR_TOKENS: JSON.stringify([{ id: "alice", sha256: good }, { id: "BOB", sha256: await moderatorTokenDigest(TOKEN_B) }]),
  });
  assert.equal(config.status, "invalid");
});

test("an invalid reason never contains a digest, a token or an id value", async () => {
  const sha256 = await moderatorTokenDigest(TOKEN_A);
  const secretId = "Secret.Id";
  const config = readModeratorConfig({ MODERATOR_TOKENS: JSON.stringify([{ id: secretId, sha256 }]) });
  assert.equal(config.status, "invalid");
  if (config.status !== "invalid") return;
  assert.ok(!config.reason.includes(sha256));
  assert.ok(!config.reason.includes(secretId));
  assert.ok(!config.reason.includes(TOKEN_A));
});

test("readModeratorConfig tolerates a missing or odd env object", () => {
  assert.equal(readModeratorConfig(undefined as unknown as Record<string, string>).status, "unconfigured");
  assert.equal(readModeratorConfig({ MODERATOR_TOKENS: 5 as unknown as string }).status, "unconfigured");
});

// ---- moderatorTokenDigest ----

test("moderatorTokenDigest is lowercase hex SHA-256 (known answers)", async () => {
  assert.equal(await moderatorTokenDigest(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(await moderatorTokenDigest("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

// ---- checkModeratorAuth: the 503 layer ----

test("unconfigured and invalid config answer 503 to everyone, even with good-looking credentials", async () => {
  const withCreds = req({ authorization: basic("alice", TOKEN_A) });
  for (const env of [{}, { MODERATOR_TOKENS: "" }, { MODERATOR_TOKENS: "[]" }, { MODERATOR_TOKENS: "oops" }]) {
    const noHeader = await checkModeratorAuth(req(), "GET", env);
    const withHeader = await checkModeratorAuth(withCreds, "GET", env);
    assert.equal(noHeader.ok, false);
    assert.equal(withHeader.ok, false);
    if (noHeader.ok || withHeader.ok) return;
    assert.equal(noHeader.status, 503);
    assert.equal(withHeader.status, 503);
  }
});

test("one bad entry fails closed for the good moderators too", async () => {
  const sha256 = await moderatorTokenDigest(TOKEN_A);
  const env = { MODERATOR_TOKENS: JSON.stringify([{ id: "alice", sha256 }, { id: "bad id", sha256 }]) };
  const result = await checkModeratorAuth(req({ authorization: basic("alice", TOKEN_A) }), "GET", env);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 503);
});

// ---- checkModeratorAuth: credentials ----

test("a configured moderator with the right token passes and the result carries the id", async () => {
  const env = await OK_ENV();
  assert.deepEqual(await checkModeratorAuth(req({ authorization: basic("alice", TOKEN_A) }), "GET", env), { ok: true, moderator: "alice" });
  assert.deepEqual(await checkModeratorAuth(req({ authorization: basic("bob.2", TOKEN_B) }), "HEAD", env), { ok: true, moderator: "bob.2" });
});

test("the Basic scheme is case-insensitive, like the admin gate", async () => {
  const env = await OK_ENV();
  const header = basic("alice", TOKEN_A).replace("Basic", "bAsIc");
  assert.deepEqual(await checkModeratorAuth(req({ authorization: header }), "GET", env), { ok: true, moderator: "alice" });
});

test("a token that contains a colon still works (split at the first colon)", async () => {
  const token = "ab:cd:ef:gh:ij:kl:mn:op:qr:st:uv:wx:yz";
  const env = await configFor(["carol", token]);
  assert.deepEqual(await checkModeratorAuth(req({ authorization: basic("carol", token) }), "GET", env), { ok: true, moderator: "carol" });
});

test("no header, wrong token, unknown id and swapped moderators are all the same 401", async () => {
  const env = await OK_ENV();
  const cases: (string | null)[] = [
    null,
    basic("alice", TOKEN_B), // another moderator's token
    basic("bob.2", TOKEN_A),
    basic("alice", TOKEN_A + "x"),
    basic("alice", TOKEN_A.slice(0, -1)),
    basic("alice", ""),
    basic("", TOKEN_A),
    basic("mallory", TOKEN_A), // unknown id, a valid token for someone else
    basic("mallory", "z".repeat(40)), // unknown id, nothing valid
    basic("ALICE", TOKEN_A), // ids are case-sensitive
    basic("alice ", TOKEN_A),
    basic(" alice", TOKEN_A),
  ];
  for (const authorization of cases) {
    const headers = authorization === null ? req() : req({ authorization });
    assert.deepEqual(await checkModeratorAuth(headers, "GET", env), DENIED_401, String(authorization));
  }
});

test("unknown id and wrong token are indistinguishable: identical result objects", async () => {
  const env = await OK_ENV();
  const unknownId = await checkModeratorAuth(req({ authorization: basic("mallory", TOKEN_A) }), "GET", env);
  const wrongToken = await checkModeratorAuth(req({ authorization: basic("alice", TOKEN_B) }), "GET", env);
  assert.deepEqual(unknownId, wrongToken);
});

test("hostile Authorization headers are 401, never a throw", async () => {
  const env = await OK_ENV();
  const hostile = [
    "",
    "Basic",
    "Basic ",
    "Basic   ",
    "Basic !!!not-base64!!!",
    "Basic " + "A".repeat(100000),
    "Bearer " + TOKEN_A,
    "Digest alice",
    "basic" + Buffer.from(`alice:${TOKEN_A}`).toString("base64"), // no space
    "Basic " + Buffer.from("alice").toString("base64"), // no colon
    "Basic " + Buffer.from([0xff, 0xfe, 0x3a, 0xff]).toString("base64"), // invalid UTF-8
    "Basic " + Buffer.from(`alice:${TOKEN_A}`).toString("base64") + "====", // junk padding
    "Basic " + Buffer.from(`alice:${TOKEN_A}`).toString("base64url") + "!", // wrong alphabet
  ];
  for (const authorization of hostile) {
    let headers: Headers;
    try {
      headers = req({ authorization });
    } catch {
      continue; // Headers itself refused the value; nothing reaches the check
    }
    const result = await checkModeratorAuth(headers, "GET", env);
    assert.equal(result.ok, false, authorization.slice(0, 30));
    if (!result.ok) assert.ok(result.status === 401, authorization.slice(0, 30));
  }
});

test("a token under the 32-character floor is refused even if its digest is configured", async () => {
  const short = "x".repeat(MODERATOR_TOKEN_MIN_LENGTH - 1);
  const env = await configFor(["dave", short]);
  assert.deepEqual(await checkModeratorAuth(req({ authorization: basic("dave", short) }), "GET", env), DENIED_401);
  const exact = "x".repeat(MODERATOR_TOKEN_MIN_LENGTH);
  const env2 = await configFor(["dave", exact]);
  assert.deepEqual(await checkModeratorAuth(req({ authorization: basic("dave", exact) }), "GET", env2), { ok: true, moderator: "dave" });
});

test("a token with whitespace, or over the length cap, is refused even if its digest is configured", async () => {
  for (const token of [`${TOKEN_A} ${TOKEN_B}`, `${TOKEN_A}\t`, `${TOKEN_A}\n`, "y".repeat(MODERATOR_TOKEN_MAX_LENGTH + 1)]) {
    const env = await configFor(["erin", token]);
    assert.deepEqual(await checkModeratorAuth(req({ authorization: basic("erin", token) }), "GET", env), DENIED_401, JSON.stringify(token.slice(0, 20)));
  }
  const atCap = "y".repeat(MODERATOR_TOKEN_MAX_LENGTH);
  const env = await configFor(["erin", atCap]);
  assert.equal((await checkModeratorAuth(req({ authorization: basic("erin", atCap) }), "GET", env)).ok, true);
});

test("an over-long token that shares a prefix with a valid one does not pass", async () => {
  const env = await configFor(["frank", "y".repeat(MODERATOR_TOKEN_MAX_LENGTH)]);
  const longer = "y".repeat(MODERATOR_TOKEN_MAX_LENGTH + 50);
  assert.deepEqual(await checkModeratorAuth(req({ authorization: basic("frank", longer) }), "GET", env), DENIED_401);
});

test("the shared admin password and username do not pass, with or without a moderator config", async () => {
  const adminPassword = "correct-horse-battery-staple-1";
  const adminHeader = req({ authorization: basic("admin", adminPassword) });
  const env = { ...(await OK_ENV()), ADMIN_PASSWORD: adminPassword, ADMIN_USERNAME: "admin" };
  assert.deepEqual(await checkModeratorAuth(adminHeader, "GET", env), DENIED_401);
  // with no moderator config it is 503, not a fallback to the admin password
  const none = await checkModeratorAuth(adminHeader, "GET", { ADMIN_PASSWORD: adminPassword });
  assert.equal(none.ok, false);
  if (!none.ok) assert.equal(none.status, 503);
  // even a moderator id paired with the admin password
  assert.deepEqual(await checkModeratorAuth(req({ authorization: basic("alice", adminPassword) }), "GET", env), DENIED_401);
});

test("the moderator check reads the env it is given, not a leftover process.env", async () => {
  const before = process.env.MODERATOR_TOKENS;
  process.env.MODERATOR_TOKENS = (await OK_ENV()).MODERATOR_TOKENS;
  try {
    const viaArg = await checkModeratorAuth(req({ authorization: basic("alice", TOKEN_A) }), "GET", {});
    assert.equal(viaArg.ok, false);
    if (!viaArg.ok) assert.equal(viaArg.status, 503);
    // and the default really is process.env
    assert.deepEqual(await checkModeratorAuth(req({ authorization: basic("alice", TOKEN_A) }), "GET"), { ok: true, moderator: "alice" });
  } finally {
    if (before === undefined) delete process.env.MODERATOR_TOKENS;
    else process.env.MODERATOR_TOKENS = before;
  }
});

test("a wrong token whose digest shares the first or the last byte with the right one is refused", async () => {
  // Kills a compare that stops early or only looks at one byte: find wrong tokens that agree on that byte.
  const env = await OK_ENV();
  const right = Buffer.from(await moderatorTokenDigest(TOKEN_A), "hex");
  let sameFirst: string | null = null;
  let sameLast: string | null = null;
  for (let i = 0; i < 20000 && (!sameFirst || !sameLast); i++) {
    const candidate = `probe-token-${i}-`.padEnd(MODERATOR_TOKEN_MIN_LENGTH, "x");
    const d = Buffer.from(await moderatorTokenDigest(candidate), "hex");
    if (!sameFirst && d[0] === right[0]) sameFirst = candidate;
    if (!sameLast && d[31] === right[31]) sameLast = candidate;
  }
  assert.ok(sameFirst && sameLast, "found probe tokens");
  for (const wrong of [sameFirst!, sameLast!]) {
    assert.notEqual(wrong, TOKEN_A);
    assert.deepEqual(await checkModeratorAuth(req({ authorization: basic("alice", wrong) }), "GET", env), DENIED_401);
  }
});

test("a non-Headers argument is a refusal, not a throw", async () => {
  const env = await OK_ENV();
  for (const bad of [null, undefined, {}, "Authorization: x", 5]) {
    const result = await checkModeratorAuth(bad as unknown as Headers, "GET", env);
    assert.deepEqual(result, DENIED_401);
  }
  // an odd method on good credentials is treated as mutating (Origin required), not as an error
  const odd = await checkModeratorAuth(req({ authorization: basic("alice", TOKEN_A) }), undefined as unknown as string, env);
  assert.equal(odd.ok, false);
  if (!odd.ok) assert.equal(odd.status, 403);
});

// ---- checkModeratorAuth: Origin on mutating methods ----

test("safe methods need no Origin", async () => {
  const env = await OK_ENV();
  for (const method of ["GET", "HEAD", "OPTIONS", "get"]) {
    assert.equal((await checkModeratorAuth(req({ authorization: basic("alice", TOKEN_A) }), method, env)).ok, true, method);
  }
});

test("mutating methods need an Origin that matches the host", async () => {
  const env = await OK_ENV();
  const auth = { authorization: basic("alice", TOKEN_A) };
  for (const method of ["POST", "PATCH", "PUT", "DELETE", "post", "TRACE", "WEIRD"]) {
    const bad = (extra: Record<string, string>) => checkModeratorAuth(req({ ...auth, ...extra }), method, env);
    const forbidden = { ok: false, status: 403, message: "Cross-origin moderation request refused." };
    assert.deepEqual(await bad({}), forbidden, `${method} no origin`);
    assert.deepEqual(await bad({ origin: "https://evil.example.invalid" }), forbidden, `${method} foreign origin`);
    assert.deepEqual(await bad({ origin: "not a url" }), forbidden, `${method} garbage origin`);
    assert.deepEqual(await bad({ origin: "null" }), forbidden, `${method} null origin`);
    assert.deepEqual(await bad({ origin: `https://${HOST}:8443` }), forbidden, `${method} other port`);
    assert.deepEqual(await bad({ origin: `https://${HOST}` }), { ok: true, moderator: "alice" }, `${method} same origin`);
  }
});

test("Origin is matched against x-forwarded-host when present, and a missing host is refused", async () => {
  const env = await OK_ENV();
  const auth = { authorization: basic("alice", TOKEN_A) };
  const proxied = new Headers({ ...auth, host: "internal.invalid", "x-forwarded-host": HOST, origin: `https://${HOST}` });
  assert.equal((await checkModeratorAuth(proxied, "POST", env)).ok, true);
  const noHost = new Headers({ ...auth, origin: `https://${HOST}` });
  const result = await checkModeratorAuth(noHost, "POST", env);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 403);
});

test("bad credentials on a mutating method are 401, not 403, whatever the Origin", async () => {
  const env = await OK_ENV();
  const result = await checkModeratorAuth(req({ authorization: basic("alice", TOKEN_B), origin: "https://evil.example.invalid" }), "POST", env);
  assert.deepEqual(result, DENIED_401);
});

// ---- never leaks ----

test("no result ever contains a token, a digest or an id", async () => {
  const env = await OK_ENV();
  const digestA = await moderatorTokenDigest(TOKEN_A);
  const results = [
    await checkModeratorAuth(req({ authorization: basic("alice", TOKEN_B) }), "GET", env),
    await checkModeratorAuth(req({ authorization: basic("mallory", TOKEN_A) }), "GET", env),
    await checkModeratorAuth(req({ authorization: basic("alice", TOKEN_A) }), "POST", env),
    await checkModeratorAuth(req(), "GET", { MODERATOR_TOKENS: "nope" }),
  ];
  for (const r of results) {
    const text = JSON.stringify(r);
    for (const secret of [TOKEN_A, TOKEN_B, digestA, "alice", "mallory", "bob.2"]) assert.ok(!text.includes(secret), text);
  }
});

test("importing the module again is harmless and a call needs no setup", async () => {
  // The module has no import-time work to observe; this only shows a second import changes nothing.
  const again = await import("../lib/moderator-auth");
  assert.equal(typeof again.checkModeratorAuth, "function");
  assert.deepEqual(again.readModeratorConfig({}), { status: "unconfigured" });
});
