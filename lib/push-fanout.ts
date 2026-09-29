/**
 * Web Push fan-out — leaf `5.k.xvi.zi`, first of the two `5.k.xvi` leaves
 * (split out of `5.k.iii.zo`). Pure functions: no I/O, no `node:` imports,
 * no new dependency, and nothing here runs at import time. Nothing here
 * throws, whatever it is handed. The sender (`5.k.xvi.zo`) sends what this
 * builds; the orchestrator (`5.k.xvii.zi`) decides what to record afterwards.
 *
 * `buildFanout(notify, devices)` answers one question: given the plan's
 * `notify` entries (what changed) and the recipients (who is subscribed to
 * what), which messages should be sent, in what order, and what did the
 * caps leave out?
 *
 * ## Decisions, recorded here so the code and the reasons stay together
 *
 * 1. **"Coalesced" means one push per (device, app), not one per device.**
 *    `readPushPayload` in `public/sw.js` accepts exactly one
 *    `{ slug, name, version }` object and rejects an array, so a push that
 *    named several apps would show only the generic "An app you saved has an
 *    update". The worker already shows one notification per app (tagged
 *    `d-store-update-<slug>`), so this needs no worker change. What
 *    "coalesced" does mean here: every message for an app carries the same
 *    per-slug `Topic`, so a newer message that is still undelivered replaces
 *    an older one at the push service, and the worker's per-app tag replaces
 *    an older notification on screen. A device is never sent two messages for
 *    the same app in one run.
 *
 * 2. **The `Topic` is a fixed-length hash of the slug.** Slugs run to 100
 *    characters; as far as I know RFC 8030 limits a `Topic` to 32 characters
 *    from the URL-safe base64 alphabet (re-check against the RFC and the
 *    `web-push` docs in `5.k.xvi.zo` before relying on it). So the topic is
 *    the first 24 bytes of SHA-256 over a fixed prefix plus the slug,
 *    encoded as unpadded base64url: exactly 32 characters, in the alphabet,
 *    the same for the same slug every time. A collision would only let one
 *    app's undelivered message replace another's at a single push service,
 *    and 192 bits make that not a practical concern. SHA-256 is written out
 *    here (about thirty lines) because this module may not import `node:`
 *    modules; it is used to spread slugs, never for anything secret.
 *
 * 3. **TTL is 72 hours** (`PUSH_TTL_SECONDS`). An update notice is worth
 *    showing for a few days and useless after a week; a device that is off
 *    for longer than that misses it, and `PushSync`/the app itself still
 *    show the version. Urgency is `normal`.
 *
 * 4. **A cap per device per run, and what it leaves out is counted.** A
 *    device subscribed to many apps that all updated at once should not be
 *    handed an unbounded burst: at most `MAX_MESSAGES_PER_DEVICE` (10)
 *    messages per device, keeping the first ones in slug order. The rest are
 *    counted in `counts.capped`, and the slugs that lost at least one message
 *    are listed in `capped_slugs` **so the orchestrator can hold those
 *    slugs' baselines back and let the next run send the remainder** — the
 *    same "silence, not a silent drop" posture as `held_back` in
 *    `lib/push-plan.ts`. There is deliberately **no global cap** here: the
 *    plan is already capped at `MAX_PLAN` entries, and the total number sent
 *    in one run is the orchestrator's time budget (`5.k.xvii.zi`), not this
 *    module's business.
 *
 * ## What is sent
 *
 * The payload is exactly `{ slug, name, version }` as a JSON string — all
 * `public/sw.js` reads. `name` and `version` are cut to the worker's own
 * display caps (80 and 40 characters, by code point, never inside a
 * surrogate pair) so a long catalog name cannot push the payload toward the
 * push service's size limit. Nothing else about the app or the device goes in.
 *
 * ## What is not sent
 *
 * A device gets a message only for a slug that is both in `notify` and in
 * that device's own slug list. A device subscribed to a slug that is not in
 * `notify` gets nothing. `baseline` entries never reach this module and
 * produce no message.
 *
 * ## Messages do not carry secrets
 *
 * A `PushMessage` names its device by `deviceIndex`, the position in the
 * `devices` array the caller passed, not by endpoint or keys. The message
 * list can therefore be logged, counted and passed around without carrying
 * an endpoint or an encryption key; the sender looks the device up by index
 * when it sends. (Indexes are positions in the caller's array, so they are
 * only meaningful against that same array.)
 *
 * ## Determinism
 *
 * Messages are ordered by device endpoint (UTF-16 code-unit order, the
 * same total order `buildPlan` uses for slugs), then by slug. Input order
 * does not change the message order or content; only `deviceIndex` values
 * follow the caller's array. The same inputs give a byte-identical result.
 *
 * ## Decisions about bad input
 *
 * Nothing throws. A `notify` entry that is not an object, or whose slug is
 * not in the catalog slug format, or whose version is not a non-empty
 * string, is skipped and counted (`notify_skipped`); a duplicate slug in
 * `notify` keeps the first. A device that is not an object, has an empty
 * or non-string endpoint or key, or whose `slugs` is not an array is
 * skipped and counted (`devices_skipped`); a second device with an endpoint
 * already seen is skipped too (first wins). If either top-level argument is
 * not an array the result is empty with `ok: false`, so a caller can tell
 * "nothing to send" from "could not read the input" and send nothing.
 */

import { validateSlugs } from "./push-validate";

/** How long a push service should hold an undelivered message: 72 hours. */
export const PUSH_TTL_SECONDS = 259200;

/** RFC 8030 `Urgency` for every message. */
export const PUSH_URGENCY = "normal" as const;

/** Most messages one device is handed in one run; the rest are counted, not dropped silently. */
export const MAX_MESSAGES_PER_DEVICE = 10;

/** RFC 8030 limits a `Topic` to 32 characters of the URL-safe base64 alphabet. */
export const PUSH_TOPIC_LENGTH = 32;

/** The service worker's own display caps (`PUSH_MAX_NAME_LENGTH` / `PUSH_MAX_VERSION_LENGTH` in `public/sw.js`). */
export const PAYLOAD_NAME_MAX = 80;
export const PAYLOAD_VERSION_MAX = 40;

/** One app that changed, as the plan carries it. A structural subset: this module imports no plan types. */
export interface FanoutNotifyEntry {
  slug: string;
  name: string;
  /** Normalized (trimmed), as `buildPlan` emits it. */
  version: string;
}

/** One device and the slugs it is subscribed to. Structural subset of `PushRecipient`; holds secrets, never log it. */
export interface FanoutDevice {
  endpoint: string;
  p256dh: string;
  auth: string;
  slugs: readonly string[];
}

/** One push to send. Carries no endpoint and no key: see "Messages do not carry secrets". */
export interface PushMessage {
  /** Position of the target device in the `devices` array passed to `buildFanout`. */
  deviceIndex: number;
  slug: string;
  version: string;
  /** 32 characters, URL-safe base64 alphabet, a function of the slug alone. */
  topic: string;
  ttl: number;
  urgency: typeof PUSH_URGENCY;
  /** JSON of exactly `{ slug, name, version }`. */
  payload: string;
}

export interface FanoutCounts {
  /** Entries handed in as `notify`. */
  notify_entries: number;
  /** Entries skipped for being malformed or duplicate slugs. */
  notify_skipped: number;
  /** Devices handed in. */
  devices_read: number;
  /** Devices skipped for being malformed or duplicate endpoints. */
  devices_skipped: number;
  /** Valid devices that were sent at least one message. */
  devices_targeted: number;
  /** Messages returned. */
  messages: number;
  /** Messages left out by `MAX_MESSAGES_PER_DEVICE`. */
  capped: number;
}

export interface FanoutResult {
  /** `false` only when an argument was not an array; the result is then empty and nothing should be recorded. */
  ok: boolean;
  messages: PushMessage[];
  /** Distinct slugs, sorted, that lost at least one message to the per-device cap. */
  capped_slugs: string[];
  counts: FanoutCounts;
}

function emptyCounts(): FanoutCounts {
  return {
    notify_entries: 0,
    notify_skipped: 0,
    devices_read: 0,
    devices_skipped: 0,
    devices_targeted: 0,
    messages: 0,
    capped: 0,
  };
}

function emptyResult(ok: boolean, counts: FanoutCounts = emptyCounts()): FanoutResult {
  return { ok, messages: [], capped_slugs: [], counts };
}

// --- SHA-256 (for the Topic only) -----------------------------------------

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** SHA-256 of a byte array. Only ever called with short ASCII input built in this file. */
function sha256(message: Uint8Array): Uint8Array {
  const len = message.length;
  const paddedLen = (((len + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(paddedLen);
  buf.set(message);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(len / 0x20000000), false);
  view.setUint32(paddedLen - 4, (len << 3) >>> 0, false);

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);

  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];

    for (let i = 0; i < 64; i++) {
      const bigS1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + bigS1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const bigS0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (bigS0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i], false);
  return out;
}

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Unpadded base64url of a byte array whose length is a multiple of 3. */
function base64UrlOfTriples(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      BASE64URL[(n >> 18) & 63] + BASE64URL[(n >> 12) & 63] + BASE64URL[(n >> 6) & 63] + BASE64URL[n & 63];
  }
  return out;
}

const TOPIC_PREFIX = "d-store-push-topic:";

/**
 * The `Topic` for a slug: 32 characters, URL-safe base64 alphabet, the same
 * every time for the same slug. Returns `null` for anything that is not a
 * valid catalog slug (so a topic is never derived from unvalidated text).
 */
export function topicForSlug(slug: unknown): string | null {
  try {
    if (typeof slug !== "string") return null;
    const checked = validateSlugs([slug]);
    if (!checked.ok) return null;
    const text = TOPIC_PREFIX + slug;
    // A valid slug is ASCII by pattern, so charCodeAt is the byte.
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
    const digest = sha256(bytes);
    return base64UrlOfTriples(digest.subarray(0, 24));
  } catch {
    return null;
  }
}

// --- Payload ---------------------------------------------------------------

/** Cut to at most `max` code points, never inside a surrogate pair. */
function cutCodePoints(text: string, max: number): string {
  const points = Array.from(text);
  return points.length <= max ? text : points.slice(0, max).join("");
}

/**
 * The exact string sent as the push body: JSON of `{ slug, name, version }`
 * and nothing else. `name` and `version` are cut to the worker's display caps.
 */
export function buildPayload(slug: string, name: string, version: string): string {
  return JSON.stringify({
    slug,
    name: cutCodePoints(name, PAYLOAD_NAME_MAX),
    version: cutCodePoints(version, PAYLOAD_VERSION_MAX),
  });
}

// --- Fan-out ---------------------------------------------------------------

interface CleanNotify {
  slug: string;
  version: string;
  topic: string;
  payload: string;
}

interface CleanDevice {
  index: number;
  endpoint: string;
  slugs: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** UTF-16 code-unit order, locale-independent (the same order `buildPlan` sorts slugs in). */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Build the messages for one run.
 *
 * @param notify  the plan's `notify` entries (`DispatchPlan.notify`).
 * @param devices the recipients (`readRecipients` → `devices`), each with the
 *                slugs it is subscribed to.
 */
export function buildFanout(
  notify: readonly FanoutNotifyEntry[],
  devices: readonly FanoutDevice[],
): FanoutResult {
  try {
    if (!Array.isArray(notify) || !Array.isArray(devices)) return emptyResult(false);

    const counts = emptyCounts();
    counts.notify_entries = notify.length;
    counts.devices_read = devices.length;

    // Notify entries: each read once into a plain snapshot, first slug wins.
    const bySlug = new Map<string, CleanNotify>();
    for (let i = 0; i < notify.length; i++) {
      const entry: unknown = notify[i];
      if (!isRecord(entry)) {
        counts.notify_skipped++;
        continue;
      }
      const slug: unknown = entry.slug;
      const name: unknown = entry.name;
      const version: unknown = entry.version;
      const topic = topicForSlug(slug);
      if (
        typeof slug !== "string" ||
        topic === null ||
        typeof version !== "string" ||
        version.length === 0 ||
        bySlug.has(slug)
      ) {
        counts.notify_skipped++;
        continue;
      }
      bySlug.set(slug, {
        slug,
        version,
        topic,
        payload: buildPayload(slug, typeof name === "string" ? name : "", version),
      });
    }

    // Devices: each read once, first endpoint wins, only slugs that are in
    // `notify` are kept (a device subscribed to anything else gets nothing).
    const seenEndpoints = new Set<string>();
    const clean: CleanDevice[] = [];
    for (let i = 0; i < devices.length; i++) {
      const device: unknown = devices[i];
      if (!isRecord(device)) {
        counts.devices_skipped++;
        continue;
      }
      const endpoint: unknown = device.endpoint;
      const p256dh: unknown = device.p256dh;
      const auth: unknown = device.auth;
      const slugs: unknown = device.slugs;
      if (
        typeof endpoint !== "string" ||
        endpoint.length === 0 ||
        typeof p256dh !== "string" ||
        p256dh.length === 0 ||
        typeof auth !== "string" ||
        auth.length === 0 ||
        !Array.isArray(slugs) ||
        seenEndpoints.has(endpoint)
      ) {
        counts.devices_skipped++;
        continue;
      }
      seenEndpoints.add(endpoint);

      const wanted = new Set<string>();
      for (let j = 0; j < slugs.length; j++) {
        const slug: unknown = slugs[j];
        if (typeof slug === "string" && bySlug.has(slug)) wanted.add(slug);
      }
      if (wanted.size === 0) continue;
      clean.push({ index: i, endpoint, slugs: Array.from(wanted).sort(compareCodeUnits) });
    }

    clean.sort((a, b) => compareCodeUnits(a.endpoint, b.endpoint));

    const messages: PushMessage[] = [];
    const cappedSlugs = new Set<string>();
    for (const device of clean) {
      let sent = 0;
      for (const slug of device.slugs) {
        const item = bySlug.get(slug);
        if (item === undefined) continue;
        if (sent >= MAX_MESSAGES_PER_DEVICE) {
          counts.capped++;
          cappedSlugs.add(slug);
          continue;
        }
        messages.push({
          deviceIndex: device.index,
          slug: item.slug,
          version: item.version,
          topic: item.topic,
          ttl: PUSH_TTL_SECONDS,
          urgency: PUSH_URGENCY,
          payload: item.payload,
        });
        sent++;
      }
      if (sent > 0) counts.devices_targeted++;
    }

    counts.messages = messages.length;
    return {
      ok: true,
      messages,
      capped_slugs: Array.from(cappedSlugs).sort(compareCodeUnits),
      counts,
    };
  } catch {
    return emptyResult(false);
  }
}
