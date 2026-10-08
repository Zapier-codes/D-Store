import test from "node:test";
import assert from "node:assert/strict";
import { allowedUpstreamHosts, downloadFilename, isAllowedUpstream, pickUpstreamUrl } from "../lib/download-proxy";

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
