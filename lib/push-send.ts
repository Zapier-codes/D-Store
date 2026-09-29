/**
 * Web Push sender — leaf `5.k.xvi.zo`.
 *
 * `sendPush(recipient, message)` delivers ONE message (built by
 * `lib/push-fanout.ts`) to ONE device and returns a classified result. It
 * never throws, never logs, and never returns an endpoint, a key or a
 * response body. Server-only: it reads server env vars and uses `web-push`,
 * which needs Node (`https`, `crypto`). Nothing here runs at import time and
 * `web-push` itself is loaded on the first real send (dynamic import), so a
 * build with every push env var unset never touches it.
 *
 * Result (`SendResult`):
 *
 * - `{ status: "sent" }` — the push service accepted the message (2xx).
 * - `{ status: "gone" }` — the push service said the subscription no longer
 *   exists (`404` or `410`, RFC 8030 §7.3). The caller prunes the row.
 * - `{ status: "not_configured" }` — VAPID env is unset or malformed. Nothing
 *   was sent and nothing was contacted.
 * - `{ status: "failed", retryable, reason }` — anything else. `reason` is a
 *   fixed string from `SendFailureReason`; it never contains request or
 *   response data. `retryable` is a hint about the *cause* (a network fault,
 *   a timeout, `429`, `5xx` are retryable; a rejected request, a refused
 *   endpoint or a bad input is not). The retry policy itself belongs to the
 *   orchestrator (`5.k.xvii.zi`), not here.
 *
 * Decisions recorded:
 *
 * 1. **VAPID.** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`
 *    are read from the env at call time and passed to `web-push` per call
 *    (`options.vapidDetails`), never through its process-global
 *    `setVapidDetails`, so no key is held in module state. Before any send
 *    they are checked here: the public key must be a 65-byte uncompressed
 *    P-256 point (the same check the stored `p256dh` gets), the private key
 *    32 bytes of unpadded base64url, the subject a `mailto:` or `https:`
 *    URL. A malformed value is treated exactly like an unset one
 *    (`not_configured`), the rule `lib/push-support.ts` uses for the public
 *    key on the client.
 * 2. **Must match the client's key.** A browser subscription is bound to the
 *    `applicationServerKey` it was created with (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`),
 *    and a push signed by a different VAPID key is rejected by the push
 *    service. So when `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is set and differs from
 *    `VAPID_PUBLIC_KEY`, `sendPush` refuses (`failed`, `vapid_mismatch`,
 *    not retryable) before contacting anyone. When it is *unset* there is
 *    nothing to compare and the send proceeds: with the client key unset
 *    nobody can have subscribed, and the server-side env is not always the
 *    same process as the build that inlines that variable.
 * 3. **Endpoint allowlist.** Only known push-service hosts are contacted
 *    (`PUSH_ENDPOINT_HOSTS`): FCM (Chrome, Chromium browsers, Android),
 *    Mozilla autopush (Firefox), WNS (Edge), Apple (Safari and installed web
 *    apps). The host must equal an entry or end in `.` + an entry. This is
 *    on top of `validateEndpoint` (https, no credentials, no port, no IP
 *    literal, no internal suffix), which cannot see what a public DNS name
 *    resolves to. **Trade-off, deliberate:** a future push service not on
 *    the list is refused (`endpoint_not_allowed`, not retryable) until it is
 *    added here. A refused endpoint is NOT reported as `gone`: an unfamiliar
 *    host is not evidence the subscription is dead, so it is never pruned by
 *    this module. The list is from memory of the four vendors' documented
 *    hosts and was **not re-checked against a live subscription**.
 * 4. **One parser.** `web-push` parses the endpoint with Node's legacy
 *    `url.parse`, while `validateEndpoint` and the allowlist use the WHATWG
 *    `URL`. They disagree on odd inputs (`\`, `@`, percent-encoded hosts). To
 *    make the disagreement unexploitable, the host as literally written
 *    between `https://` and the next `/` or `?` must equal `URL.hostname`
 *    exactly (same case, no trailing dot, no escapes); anything else is
 *    `endpoint_not_allowed`. Both parsers then see the same host.
 * 5. **Redirects.** Checked, not assumed: `web-push` 3.6.7 sends with Node's
 *    core `https.request`, which never follows redirects, and rejects every
 *    non-2xx response with a `WebPushError` carrying the status. So a `3xx`
 *    from a push service surfaces as a failure and the `Location` is never
 *    fetched. It is classified `redirect_refused` (not retryable). No proxy
 *    or custom agent is configured, so `HTTPS_PROXY`-style env has no
 *    effect here.
 * 6. **Time.** A socket timeout (`PUSH_SOCKET_TIMEOUT_MS`, `web-push`'s own
 *    option) plus an overall deadline (`PUSH_SEND_DEADLINE_MS`) raced against
 *    the send, so a slow-drip response cannot hold a slot open (the socket
 *    timeout is an idle timer, not a total one). A deadline that fires is
 *    `timeout`, retryable; the abandoned request is destroyed by the socket
 *    timer and its eventual rejection is swallowed.
 * 7. **Message inputs are used as given** (`payload`, `topic`, `ttl`,
 *    `urgency` from `PushMessage`) but re-validated, because this module is
 *    the last check before the network: `topic` must be 1-32 characters of
 *    the URL-safe base64 alphabet (confirmed against `web-push` 3.6.7, which
 *    enforces exactly that and throws otherwise), `ttl` an integer from 0 to
 *    `PUSH_MAX_TTL_SECONDS`, `urgency` one of the four RFC 8030 values, and
 *    `payload` a non-empty string of at most `PUSH_MAX_PAYLOAD_BYTES` UTF-8
 *    bytes. A bad message is `invalid_message`, not retryable.
 * 8. **A key that will not encrypt.** `validatePushSubscription` cannot check
 *    that `p256dh` is a point on the curve (that needs `node:crypto`); such a
 *    key fails inside `web-push` before any request. That is classified
 *    `unsendable` (not retryable). It is *not* reported as `gone`, because an
 *    unrecognised local error is not proof the row is dead; whether to drop
 *    such rows is the orchestrator's call (`5.k.xvii.zi`).
 * 9. **Response bodies are never read by this module**, but `web-push` itself
 *    buffers a response body into a string with no size limit. Push services
 *    answer with an empty or tiny body, and the socket timeout and overall
 *    deadline bound how long it can be fed, but the size is not capped. Capping
 *    it would mean replacing `web-push`'s transport with a hand-written one;
 *    that is deliberately not done here and is recorded as a known gap.
 *
 * Testing seam: `deps.transport` replaces the network call (the fake
 * transport the leaf asks for), `deps.env` replaces `process.env` and
 * `deps.deadlineMs` shortens the overall deadline. The default transport is
 * the only code that imports `web-push`.
 */

import { validateAuth, validateEndpoint, validateP256dh, decodeBase64Url } from "./push-validate";

/** Hosts (and their subdomains) of the push services a browser subscription can point at. */
export const PUSH_ENDPOINT_HOSTS: readonly string[] = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];

/** Idle socket timeout handed to `web-push`. */
export const PUSH_SOCKET_TIMEOUT_MS = 8000;
/** Total time one send may take before it is abandoned as `timeout`. */
export const PUSH_SEND_DEADLINE_MS = 10000;
/** Four weeks: the ceiling `web-push` itself defaults to and push services commonly clamp to. */
export const PUSH_MAX_TTL_SECONDS = 2419200;
/**
 * Largest payload accepted: a push service must accept a 4096-byte body
 * (RFC 8030 §7.2) and `aes128gcm` (RFC 8291) spends 103 of them on its
 * header, tag and padding delimiter. From memory of the RFCs, not re-checked.
 */
export const PUSH_MAX_PAYLOAD_BYTES = 3993;

const TOPIC_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const URGENCIES = ["very-low", "low", "normal", "high"] as const;
const VAPID_PRIVATE_KEY_BYTES = 32;

export type SendFailureReason =
  | "invalid_recipient"
  | "invalid_message"
  | "endpoint_not_allowed"
  | "vapid_mismatch"
  | "unsendable"
  | "redirect_refused"
  | "rejected"
  | "rate_limited"
  | "server_error"
  | "network"
  | "timeout"
  | "unexpected";

export type SendResult =
  | { status: "sent" }
  | { status: "gone" }
  | { status: "not_configured" }
  | { status: "failed"; retryable: boolean; reason: SendFailureReason };

/** The device to send to. Holds secrets: never log it. */
export interface SendRecipient {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** The message to send: the fields of `PushMessage` this module uses. */
export interface SendMessage {
  payload: string;
  topic: string;
  ttl: number;
  urgency: string;
}

export interface VapidDetails {
  subject: string;
  publicKey: string;
  privateKey: string;
}

/** What the transport is asked to do. Holds secrets: never log it. */
export interface PushTransportRequest {
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: string;
  ttl: number;
  urgency: string;
  topic: string;
  vapid: VapidDetails;
  socketTimeoutMs: number;
}

/**
 * Performs the HTTP request. Resolves for a 2xx (`{ statusCode }`), and
 * rejects for anything else: an error with a numeric `statusCode` is an HTTP
 * answer (this is what `WebPushError` looks like), any other error is a
 * local or network failure.
 */
export type PushTransport = (request: PushTransportRequest) => Promise<{ statusCode: number }>;

export interface SendDeps {
  transport?: PushTransport;
  env?: Record<string, string | undefined>;
  /** Overrides `PUSH_SEND_DEADLINE_MS`; for tests. */
  deadlineMs?: number;
}

function failed(reason: SendFailureReason, retryable: boolean): SendResult {
  return { status: "failed", retryable, reason };
}

/** Returns the VAPID details, or `null` when any of the three is unset or malformed. */
export function readVapidDetails(env: Record<string, string | undefined>): VapidDetails | null {
  try {
    const publicKey = env.VAPID_PUBLIC_KEY;
    const privateKey = env.VAPID_PRIVATE_KEY;
    const subject = env.VAPID_SUBJECT;
    if (typeof publicKey !== "string" || typeof privateKey !== "string" || typeof subject !== "string") return null;
    if (!validateP256dh(publicKey).ok) return null;
    const privateBytes = /^[A-Za-z0-9_-]+$/.test(privateKey) ? decodeBase64Url(privateKey) : null;
    if (privateBytes === null || privateBytes.length !== VAPID_PRIVATE_KEY_BYTES) return null;
    if (subject.length === 0 || subject.length > 500 || /[\s\u0000-\u001f\u007f]/.test(subject)) return null;
    if (!(subject.startsWith("mailto:") && subject.length > "mailto:".length) && !subject.startsWith("https://")) return null;
    return { subject, publicKey, privateKey };
  } catch {
    return null;
  }
}

/** True when the host is an allowlisted push service and both URL parsers will agree on it. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    if (!validateEndpoint(endpoint).ok) return false;
    const url = new URL(endpoint);
    const written = endpoint.slice("https://".length).split(/[/?]/, 1)[0];
    if (written !== url.hostname) return false;
    const host = url.hostname;
    return PUSH_ENDPOINT_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}

function messageIsValid(message: unknown): message is SendMessage {
  if (typeof message !== "object" || message === null) return false;
  const { payload, topic, ttl, urgency } = message as Record<string, unknown>;
  if (typeof payload !== "string" || payload.length === 0 || utf8Length(payload) > PUSH_MAX_PAYLOAD_BYTES) return false;
  if (typeof topic !== "string" || !TOPIC_PATTERN.test(topic)) return false;
  if (typeof ttl !== "number" || !Number.isInteger(ttl) || ttl < 0 || ttl > PUSH_MAX_TTL_SECONDS) return false;
  if (typeof urgency !== "string" || !(URGENCIES as readonly string[]).includes(urgency)) return false;
  return true;
}

function recipientIsValid(recipient: unknown): recipient is SendRecipient {
  if (typeof recipient !== "object" || recipient === null) return false;
  const { endpoint, p256dh, auth } = recipient as Record<string, unknown>;
  return validateEndpoint(endpoint).ok && validateP256dh(p256dh).ok && validateAuth(auth).ok;
}

/** Minimal shape of the `web-push` module used here, so this file does not depend on its typings' details. */
interface WebPushModule {
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options: {
      vapidDetails: VapidDetails;
      TTL: number;
      urgency: "very-low" | "low" | "normal" | "high";
      topic: string;
      timeout: number;
    },
  ): Promise<{ statusCode: number }>;
}

/** The default transport: `web-push`, loaded on first use. No proxy, no custom agent. */
const webPushTransport: PushTransport = async (request) => {
  const imported = (await import("web-push")) as unknown as { default?: WebPushModule } & Partial<WebPushModule>;
  const webPush = (imported.default ?? imported) as WebPushModule;
  const result = await webPush.sendNotification(
    { endpoint: request.endpoint, keys: { p256dh: request.p256dh, auth: request.auth } },
    request.payload,
    {
      vapidDetails: request.vapid,
      TTL: request.ttl,
      urgency: request.urgency as "very-low" | "low" | "normal" | "high",
      topic: request.topic,
      timeout: request.socketTimeoutMs,
    },
  );
  return { statusCode: result.statusCode };
};

function classifyStatus(status: number): SendResult {
  if (status >= 200 && status <= 299) return { status: "sent" };
  if (status === 404 || status === 410) return { status: "gone" };
  if (status >= 300 && status <= 399) return failed("redirect_refused", false);
  if (status === 429) return failed("rate_limited", true);
  if (status >= 500 && status <= 599) return failed("server_error", true);
  if (status >= 400 && status <= 499) return failed("rejected", false);
  return failed("unexpected", false);
}

function classifyError(error: unknown): SendResult {
  try {
    if (typeof error === "object" && error !== null) {
      const { statusCode, code, message } = error as { statusCode?: unknown; code?: unknown; message?: unknown };
      if (typeof statusCode === "number" && Number.isInteger(statusCode)) return classifyStatus(statusCode);
      if (message === "Socket timeout") return failed("timeout", true);
      if (typeof code === "string" && code !== "") return failed("network", true);
    }
    return failed("unsendable", false);
  } catch {
    return failed("unexpected", false);
  }
}

/**
 * Sends one message to one device. Never throws; see the file header for
 * the result and every decision.
 */
export async function sendPush(
  recipient: SendRecipient,
  message: SendMessage,
  deps: SendDeps = {},
): Promise<SendResult> {
  try {
    const env = deps.env ?? process.env;
    const vapid = readVapidDetails(env);
    if (vapid === null) return { status: "not_configured" };

    const clientKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (typeof clientKey === "string" && clientKey !== "" && clientKey !== vapid.publicKey) {
      return failed("vapid_mismatch", false);
    }

    if (!recipientIsValid(recipient)) return failed("invalid_recipient", false);
    if (!isAllowedPushEndpoint(recipient.endpoint)) return failed("endpoint_not_allowed", false);
    if (!messageIsValid(message)) return failed("invalid_message", false);

    const transport = deps.transport ?? webPushTransport;
    const deadlineMs = typeof deps.deadlineMs === "number" && deps.deadlineMs > 0 ? deps.deadlineMs : PUSH_SEND_DEADLINE_MS;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<"deadline">((resolve) => {
      timer = setTimeout(() => resolve("deadline"), deadlineMs);
    });
    const attempt = transport({
      endpoint: recipient.endpoint,
      p256dh: recipient.p256dh,
      auth: recipient.auth,
      payload: message.payload,
      ttl: message.ttl,
      urgency: message.urgency,
      topic: message.topic,
      vapid,
      socketTimeoutMs: PUSH_SOCKET_TIMEOUT_MS,
    }).then(
      (value) => ({ kind: "value" as const, value }),
      (error: unknown) => ({ kind: "error" as const, error }),
    );

    try {
      const outcome = await Promise.race([attempt, deadline]);
      if (outcome === "deadline") return failed("timeout", true);
      if (outcome.kind === "error") return classifyError(outcome.error);
      const status = (outcome.value as { statusCode?: unknown } | null)?.statusCode;
      return typeof status === "number" && Number.isInteger(status) ? classifyStatus(status) : failed("unexpected", false);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  } catch {
    return failed("unexpected", false);
  }
}
