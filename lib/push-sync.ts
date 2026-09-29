import { selectSlugs } from "@/lib/push-support";

/**
 * Favorites -> push-subscription re-sync controller — leaf `5.k.ix.zi`.
 *
 * Pure control flow, no React, no browser globals: everything it touches is
 * passed in, so a Node test can drive it with fakes and fake timers.
 * `components/PushSync.tsx` wires it to the real favorites store and
 * `lib/push-client.ts`.
 *
 * **Debounced:** `request()` restarts a timer, so a burst of toggles is one
 * sync, not one per toggle.
 *
 * **Last-write-wins:** at most one send is in flight. A `request()` that lands
 * while one is running does not start a second send (two overlapping POSTs can
 * be processed in either order by the server, letting an older list overwrite
 * a newer one); it marks the controller dirty and, once the running send
 * finishes, the list is read again and sent once more. The favorites are
 * always read immediately before a send, so the final send reflects the
 * latest state.
 *
 * Failures are swallowed: this is a background re-sync, and the next favorites
 * change or page load tries again. Nothing here logs, and the subscription
 * endpoint/keys never pass through this module.
 */

export const SYNC_DEBOUNCE_MS = 1500;

export interface PushSyncDeps {
  /** Whether a sync should happen right now (permission granted + subscribed). Checked before every read. */
  gate: () => Promise<boolean>;
  /** The saved apps, as `listFavorites()` returns them. */
  read: () => Promise<unknown>;
  /** Replace the server-side slug set for this device's subscription. */
  send: (slugs: string[]) => Promise<unknown>;
  debounceMs?: number;
  /** Test seams; default to the global timers, read when called. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface PushSyncController {
  /** Schedule a sync (debounced). Safe to call repeatedly. */
  request(): void;
  /** Cancel anything pending and ignore later `request()` calls. */
  dispose(): void;
}

export function createPushSync(deps: PushSyncDeps): PushSyncController {
  const debounceMs = deps.debounceMs ?? SYNC_DEBOUNCE_MS;
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let timer: unknown = null;
  let disposed = false;
  let inFlight = false;
  let dirty = false;

  async function once(): Promise<void> {
    try {
      if (!(await deps.gate())) return;
      const favorites = await deps.read();
      if (disposed) return;
      await deps.send(selectSlugs(favorites).slugs);
    } catch {
      // Swallowed by design; see the header comment.
    }
  }

  async function run(): Promise<void> {
    if (disposed) return;
    if (inFlight) {
      dirty = true;
      return;
    }
    inFlight = true;
    try {
      do {
        dirty = false;
        await once();
      } while (dirty && !disposed);
    } finally {
      inFlight = false;
    }
  }

  return {
    request() {
      if (disposed) return;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(() => {
        timer = null;
        void run();
      }, debounceMs);
    },
    dispose() {
      disposed = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
