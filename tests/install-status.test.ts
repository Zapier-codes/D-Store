import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { recordInstalledVersion } from "../lib/install-status";

// Leaf 5.c.x.zo. A fake window; Node has no DOM.
type Ev = { type: string; detail: unknown };
let store: Map<string, string>;
let events: Ev[];
let throwOnSet = false;
let throwOnDispatch = false;
const g = globalThis as unknown as Record<string, unknown>;

class FakeCustomEvent {
  type: string;
  detail: unknown;
  constructor(type: string, init?: { detail?: unknown }) {
    this.type = type;
    this.detail = init?.detail;
  }
}

beforeEach(() => {
  store = new Map();
  events = [];
  throwOnSet = false;
  throwOnDispatch = false;
  g.CustomEvent = FakeCustomEvent;
  g.window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (throwOnSet) throw new Error("storage disabled");
        store.set(k, v);
      },
      removeItem: (k: string) => void store.delete(k),
    },
    dispatchEvent: (e: Ev) => {
      if (throwOnDispatch) throw new Error("dispatch failed");
      events.push(e);
      return true;
    },
  };
});

afterEach(() => {
  delete g.window;
  delete g.CustomEvent;
});

test("writes the record under the install key and fires the change event once", () => {
  recordInstalledVersion("whatsapp", "2.1.0");
  assert.deepEqual([...store.keys()], ["d-store:installed:whatsapp"]);
  const rec = JSON.parse(store.get("d-store:installed:whatsapp")!);
  assert.equal(rec.version, "2.1.0");
  assert.equal(typeof rec.installedAt, "string");
  assert.ok(!Number.isNaN(Date.parse(rec.installedAt)));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "d-store-install-change");
  assert.deepEqual(events[0].detail, { appSlug: "whatsapp" });
});

test("a second call replaces the record", () => {
  recordInstalledVersion("a", "1.0.0");
  recordInstalledVersion("a", "0.9.0");
  assert.equal(JSON.parse(store.get("d-store:installed:a")!).version, "0.9.0");
  assert.equal(events.length, 2);
});

test("it does not throw when storage throws, and fires no event", () => {
  throwOnSet = true;
  assert.doesNotThrow(() => recordInstalledVersion("a", "1.0.0"));
  assert.equal(store.size, 0);
  assert.equal(events.length, 0);
});

test("it does not throw when dispatching throws", () => {
  throwOnDispatch = true;
  assert.doesNotThrow(() => recordInstalledVersion("a", "1.0.0"));
});

test("it is a no-op without window", () => {
  delete g.window;
  assert.doesNotThrow(() => recordInstalledVersion("a", "1.0.0"));
  assert.equal(store.size, 0);
});

test("a bad slug or version writes nothing and does not throw", () => {
  const bad: unknown[] = ["", undefined, null, 0, 1, {}, [], true, Symbol("x")];
  for (const b of bad) {
    assert.doesNotThrow(() => recordInstalledVersion(b as string, "1.0.0"));
    assert.doesNotThrow(() => recordInstalledVersion("a", b as string));
  }
  assert.equal(store.size, 0);
  assert.equal(events.length, 0);
});
