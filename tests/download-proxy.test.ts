import test from "node:test";
import assert from "node:assert/strict";
import {
  allowedUpstreamHosts,
  checkUpstream,
  declaredBodyBytes,
  downloadFilename,
  isAcceptableUpstreamType,
  isAllowedUpstream,
  lengthGuard,
  pickUpstreamUrl,
  rangeSpanBytes,
} from "../lib/download-proxy";

const hosts = ["zealot-deploy-latest.onrender.com"];

test("allowedUpstreamHosts: default and comma list", () => {
  assert.deepEqual(allowedUpstreamHosts({}), ["zealot-deploy-latest.onrender.com"]);
  assert.deepEqual(allowedUpstreamHosts({ ZEALOT_MEDIA_HOSTS: " A.example , b.example,," }), ["a.example", "b.example"]);
});

test("isAllowedUpstream: https on an allowed host only", () => {
  assert.equal(isAllowedUpstream("https://zealot-deploy-latest.onrender.com/download/releases/6", hosts), true);
  assert.equal(isAllowedUpstream("http://zealot-deploy-latest.onrender.com/x", hosts), false);
  assert.equal(isAllowedUpstream("https://evil.example/x", hosts), false);
  assert.equal(isAllowedUpstream("https://zealot-deploy-latest.onrender.com.evil.example/x", hosts), false);
  assert.equal(isAllowedUpstream("https://user:pw@zealot-deploy-latest.onrender.com/x", hosts), false); // no credentials
  assert.equal(isAllowedUpstream(null, hosts), false);
  assert.equal(isAllowedUpstream("", hosts), false);
  assert.equal(isAllowedUpstream("not a url", hosts), false);
});

test("downloadFilename: name and version, safe characters, never empty", () => {
  assert.equal(downloadFilename("appstore", "1.1.4"), "appstore-1.1.4.apk");
  assert.equal(downloadFilename("my app", "1.0 beta/2"), "my-app-1.0-beta-2.apk");
  assert.equal(downloadFilename("..", ""), "app.apk");
  assert.ok(!downloadFilename("a".repeat(500), "1").includes(" "));
  assert.ok(downloadFilename("a".repeat(500), "1").length <= 104);
});

const entry = (version_name: string, extra: Record<string, unknown> = {}) => ({
  version_name,
  changelog: null,
  size_mb: 1,
  rollout_percentage: 100,
  rollout_status: "complete" as const,
  status: "available" as const,
  download_url: `https://zealot-deploy-latest.onrender.com/download/releases/${version_name}`,
  permissions: [],
  ...extra,
});

test("pickUpstreamUrl: current release for no version, older version only when offered", () => {
  const app = {
    apk: "https://zealot-deploy-latest.onrender.com/download/releases/9",
    version: "1.2.0",
    version_history: [entry("1.2.0"), entry("1.1.0"), entry("1.0.0", { status: "pulled" })],
  } as never;
  assert.equal(pickUpstreamUrl(app, null), "https://zealot-deploy-latest.onrender.com/download/releases/9");
  assert.equal(pickUpstreamUrl(app, "1.2.0"), "https://zealot-deploy-latest.onrender.com/download/releases/9");
  assert.equal(pickUpstreamUrl(app, "1.1.0"), "https://zealot-deploy-latest.onrender.com/download/releases/1.1.0");
  assert.equal(pickUpstreamUrl(app, "1.0.0"), null); // pulled
  assert.equal(pickUpstreamUrl(app, "9.9.9"), null); // unknown
  assert.equal(pickUpstreamUrl({ apk: "", version: "1", version_history: [] } as never, null), null);
});

const headersOf = (init: Record<string, string>) => new Headers(init);

test("isAcceptableUpstreamType: a page or data is never an APK", () => {
  assert.equal(isAcceptableUpstreamType(null), true);
  assert.equal(isAcceptableUpstreamType(""), true);
  assert.equal(isAcceptableUpstreamType("application/octet-stream"), true);
  assert.equal(isAcceptableUpstreamType("application/vnd.android.package-archive"), true);
  assert.equal(isAcceptableUpstreamType("binary/octet-stream; charset=binary"), true);
  assert.equal(isAcceptableUpstreamType("text/html; charset=utf-8"), false);
  assert.equal(isAcceptableUpstreamType("text/plain"), false);
  assert.equal(isAcceptableUpstreamType("application/json"), false);
  assert.equal(isAcceptableUpstreamType("application/problem+json"), false);
  assert.equal(isAcceptableUpstreamType("application/xml"), false);
});

test("declaredBodyBytes: plain digits only", () => {
  assert.equal(declaredBodyBytes("31238330"), 31238330);
  assert.equal(declaredBodyBytes(" 12 "), 12);
  assert.equal(declaredBodyBytes(null), null);
  assert.equal(declaredBodyBytes(""), null);
  assert.equal(declaredBodyBytes("-1"), null);
  assert.equal(declaredBodyBytes("1e6"), null);
  assert.equal(declaredBodyBytes("12, 12"), null);
  assert.equal(declaredBodyBytes("1".repeat(16)), null);
});

test("rangeSpanBytes: the body a 206 must carry", () => {
  assert.equal(rangeSpanBytes("bytes 0-99/1000"), 100);
  assert.equal(rangeSpanBytes("bytes 900-999/1000"), 100);
  assert.equal(rangeSpanBytes("bytes 5-5/*"), 1);
  assert.equal(rangeSpanBytes("bytes 10-5/1000"), null); // end before start
  assert.equal(rangeSpanBytes("bytes 0-1000/1000"), null); // end beyond the total
  assert.equal(rangeSpanBytes("bytes */1000"), null);
  assert.equal(rangeSpanBytes("items 0-9/10"), null);
  assert.equal(rangeSpanBytes(null), null);
});

test("checkUpstream: 200 with a length enforces it; no length enforces nothing", () => {
  assert.deepEqual(
    checkUpstream(200, headersOf({ "content-type": "application/octet-stream", "content-length": "31238330" })),
    { ok: true, expectedBytes: 31238330 }
  );
  assert.deepEqual(checkUpstream(200, headersOf({ "content-type": "application/octet-stream" })), {
    ok: true,
    expectedBytes: null,
  });
});

test("checkUpstream: refuses what could look like a finished file but is not one", () => {
  const refused = (status: number, init: Record<string, string>) => checkUpstream(status, headersOf(init)).ok === false;
  assert.equal(refused(404, {}), true);
  assert.equal(refused(302, {}), true);
  assert.equal(refused(200, { "content-type": "text/html", "content-length": "500" }), true); // an error page
  assert.equal(refused(200, { "content-type": "application/json" }), true);
  assert.equal(refused(200, { "content-encoding": "gzip", "content-length": "100" }), true); // length cannot be trusted
  assert.equal(refused(200, { "content-length": "abc" }), true);
  assert.equal(refused(200, { "content-length": "0" }), true); // an empty file
  assert.equal(refused(206, { "content-length": "100" }), true); // no content-range
  assert.equal(refused(206, { "content-range": "bytes 0-99/1000", "content-length": "50" }), true); // disagree
});

test("checkUpstream: a 206 enforces the range's own length", () => {
  assert.deepEqual(checkUpstream(206, headersOf({ "content-range": "bytes 100-199/1000", "content-length": "100" })), {
    ok: true,
    expectedBytes: 100,
  });
  assert.deepEqual(checkUpstream(206, headersOf({ "content-range": "bytes 100-199/1000" })), {
    ok: true,
    expectedBytes: 100,
  });
  assert.deepEqual(checkUpstream(200, headersOf({ "content-encoding": "identity", "content-length": "7" })), {
    ok: true,
    expectedBytes: 7,
  });
});

function streamOf(...sizes: number[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const size of sizes) controller.enqueue(new Uint8Array(size));
      controller.close();
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<{ bytes: number; failed: boolean }> {
  const reader = stream.getReader();
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return { bytes, failed: false };
      bytes += value.byteLength;
    }
  } catch {
    return { bytes, failed: true };
  }
}

test("lengthGuard: an exact body passes, a short or long one fails the response", async () => {
  assert.deepEqual(await drain(streamOf(4, 6).pipeThrough(lengthGuard(10))), { bytes: 10, failed: false });
  assert.equal((await drain(streamOf(4, 5).pipeThrough(lengthGuard(10)))).failed, true); // ended short
  assert.equal((await drain(streamOf(4, 8).pipeThrough(lengthGuard(10)))).failed, true); // ran long
  assert.equal((await drain(streamOf().pipeThrough(lengthGuard(10)))).failed, true); // nothing at all
});
