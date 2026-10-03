import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { normalizeAptoideApp } from "../lib/sources/aptoide";
import { readSnapshotFiles } from "../lib/aptoide-snapshot-io";

const fixture: any[] = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "aptoide-snapshot-12.json"), "utf8"));
const base = fixture[0];

function withDeveloper(developer: unknown) {
  return { ...structuredClone(base), uname: "dev-case-app", developer } as any;
}

test("a null developer name does not throw and is labelled honestly", () => {
  const app = normalizeAptoideApp(withDeveloper({ id: 1, name: null }));
  assert.equal(app.developer_name, "Unknown developer");
  assert.equal(app.developer_slug, "unknown-dev-case-app");
});

test("a blank developer name and a missing developer object behave the same", () => {
  for (const developer of [{ id: 1, name: "   " }, undefined, null]) {
    const app = normalizeAptoideApp(withDeveloper(developer));
    assert.equal(app.developer_name, "Unknown developer");
    assert.equal(app.developer_slug, "unknown-dev-case-app");
  }
});

test("a non-Latin developer name keeps its name but gets a slug of its own (not an empty slug)", () => {
  const app = normalizeAptoideApp(withDeveloper({ id: 1, name: "开发者" }));
  assert.equal(app.developer_name, "开发者");
  assert.equal(app.developer_slug, "unknown-dev-case-app");
});

test("a normal developer name is unchanged", () => {
  const app = normalizeAptoideApp(withDeveloper({ id: 1, name: "Acme Ltd", website: "https://acme.test" }));
  assert.equal(app.developer_name, "Acme Ltd");
  assert.equal(app.developer_slug, "acme-ltd");
  assert.equal(app.developer_website, "https://acme.test");
});

test("every app in the REAL committed snapshot normalizes (grows with each crawl; no count baked in)", () => {
  const dir = path.join(__dirname, "..", "storage", "downloads");
  const shards = readdirSync(dir).filter((f) => /^aptoide-snapshot(\.\d+)?\.json$/.test(f));
  assert.ok(shards.length >= 1);
  const failures: string[] = [];
  let total = 0;
  for (const file of shards) {
    for (const raw of JSON.parse(readFileSync(path.join(dir, file), "utf8")) as any[]) {
      total += 1;
      try {
        normalizeAptoideApp(raw);
      } catch (error) {
        failures.push(`${raw?.uname ?? raw?.package}: ${(error as Error).message}`);
      }
    }
  }
  assert.ok(total > 0);
  assert.deepEqual(failures.slice(0, 5), []);
});

test("the committed snapshot still loads through the script-side reader (the storefront no longer reads it)", async () => {
  const dir = path.join(__dirname, "..", "storage", "downloads");
  const loaded = await readSnapshotFiles(dir);
  assert.ok(loaded.apps.length > 0);
});
