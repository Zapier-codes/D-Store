# Connecting this repo to Vercel (leaf 0.a.i.zi)

The Next.js app now lives at the **repo root**. The old Symfony app was
moved to `legacy-symfony/` so it's out of the way. This means Vercel's
import flow auto-detects the Next.js framework with no configuration —
there's no "Root Directory" field to set, now or on any future import.

Steps:

1. Go to https://vercel.com/new and import this GitHub repo
   (`Zapier-codes/D-Store`).
2. Vercel detects Next.js automatically from the root `package.json` —
   accept the defaults and deploy. Nothing to point or configure.
3. Every push to any branch/PR now gets an automatic preview
   deployment; pushes to `master` deploy to production.

Once this is done, leaf `0.a.i.zo` (confirm a live preview URL renders
end-to-end) can be checked off against the real deployed URL.


---

## Web Push environment variables (leaves 5.k.xiii.zo, 5.k.xvii.zo)

Web Push for saved-app updates (track `5.k`) reads the environment variables
below. **None are required for the site to build or run** — with all of them
unset the storefront works exactly as before, the "Notify me about updates"
control renders nothing, and both push routes fail closed. Set them in
Vercel → Project → Settings → Environment Variables.

| Variable | Scope | Purpose |
|---|---|---|
| `SUPABASE_URL` | server-only | Project URL of D-Store's **own** Supabase project (never Zealot's). |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only — never `NEXT_PUBLIC_`** | Service-role key used by `lib/push-store.ts` for the subscription tables. Bypasses RLS, so it must never reach the browser. |
| `PUSH_DISPATCH_SECRET` | server-only | Shared secret for `POST /api/push/dispatch`. **At least 32 characters, no whitespace.** Unset or shorter answers `503` (fails closed). |
| `RATE_LIMIT_SALT` | server-only | Long random string mixed into the hashed client address used as the rate-limit bucket key (`lib/rate-limit.ts`). No raw IP is stored; without the salt the hashes could be brute-forced. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | public (inlined at build) | VAPID public key. While unset, the opt-in control renders nothing and nothing is collected. |
| `VAPID_PUBLIC_KEY` | server-only | VAPID public key the sender signs with. **Must equal `NEXT_PUBLIC_VAPID_PUBLIC_KEY`**: browsers bind a subscription to the key it was created with, so a sender using a different key is refused by the push services. `POST /api/push/send` refuses to send (`503`) when both are set and differ. |
| `VAPID_PRIVATE_KEY` | **server-only — never `NEXT_PUBLIC_`** | The matching private key. Never commit it, never log it. |
| `VAPID_SUBJECT` | server-only | Contact for the push services, `mailto:you@example.com` or an `https://` URL. |
| `PUSH_SEND_ENABLED` | server-only | The explicit opt-in for sending. `POST /api/push/send` does nothing unless this is exactly `true`. |

**Two warnings that hold today — do not skip them:**

1. **Before setting `SUPABASE_SERVICE_ROLE_KEY` in production, apply the
   `20261001000000_create_rate_limit.sql` migration and set `RATE_LIMIT_SALT`
   to a long random string.** The subscribe/unsubscribe routes (and the
   report, install, view and review routes) are throttled per hashed client
   address through that table (`5.k.vi.zo`). The push routes fail *closed*: if
   the migration is missing they answer `429` rather than accept unthrottled
   writes. Without the salt the address hashes can be reversed by brute force.
2. **Keep `NEXT_PUBLIC_VAPID_PUBLIC_KEY` unset until you have decided how
   the sender will be triggered.** The sender exists (`POST /api/push/send`,
   below) but **nothing calls it**: the trigger (`5.k.iv.zi`) is still Held.
   A visitor who opts in would be subscribed to notifications that only go
   out when someone calls the route by hand. `NEXT_PUBLIC_` values are
   inlined at build time, so changing it needs a redeploy.
3. **The sender has never delivered a real notification.** It has been run
   end to end only against a fake store and with no route to a real push
   service (see the leaf's Done note in `HANDOVER.md`). Send to your own
   device first, and expect to fix things.

### `POST /api/push/dispatch` (read-only plan)

Computes the plan for the next Web Push run. **It writes nothing and sends
nothing.** `POST /api/push/send` (below) computes the same plan itself; this
route is for looking before you send.

Call it with `Authorization: Bearer <PUSH_DISPATCH_SECRET>`, `POST`, no body,
on the primary host (the default tenant):

```
curl -X POST https://<primary-host>/api/push/dispatch \
  -H "Authorization: Bearer $PUSH_DISPATCH_SECRET"
```

Statuses (every error body is a fixed string; none names a tenant, slug or
upstream message):

| Status | Meaning |
|---|---|
| `200` | Plan, possibly with empty lists. |
| `401` | Missing or wrong bearer secret. |
| `405` | Any method other than `POST` (Next's own). |
| `421` | Request resolved to a non-default tenant — call the primary host. |
| `502` | A subscription-store read or the catalog read failed. Never planned against. |
| `503` | `PUSH_DISPATCH_SECRET` unset/too short, or the Supabase env vars unset. |

`200` body (`Cache-Control: no-store`; slugs, names and versions only — never
a push endpoint, key or per-slug subscriber count):

```json
{
  "notify":   [ { "slug": "firefox", "name": "Firefox", "version": "131.0" } ],
  "baseline": [ { "slug": "obsidian", "version": "1.7.4" } ],
  "counts": {
    "considered": 2,
    "notify": 1,
    "baseline": 1,
    "unchanged": 0,
    "held_back": 0,
    "deferred": 0
  }
}
```

- `notify` — subscribed apps whose catalog version differs from the recorded
  `push_notified_version` and whose rollout is `complete` **and** `100`. One
  notification per (slug, version). `version` is the trimmed string that was
  compared.
- `baseline` — subscribed apps with no recorded version yet. The sender
  records these **without notifying**, so the first run after launch never
  spams anyone.
- `counts.considered` — distinct subscribed catalog slugs; `unchanged` and
  `held_back` (rollout not yet complete) produce no entry, only a count.
- `counts.deferred > 0` — the run hit the cap (`MAX_PLAN = 100` combined
  `notify` + `baseline` entries); deferred apps are not lost. **Call the
  route again.**
- Entries are sorted by slug, so a repeated call with unchanged state is
  byte-identical. Feeding the returned versions back in as baselines yields an
  empty plan (idempotent).
- Worst-case latency is (1 + baseline batches) × 8 s of store reads, against
  the platform's function limit.

### `POST /api/push/send` (the sender, opt-in)

Runs one sending pass: computes the plan (as above), sends one push per
(device, app) with a per-app `Topic`, deletes endpoints the push service says
are gone (`404`/`410`), and records the new baselines. **This is the only
route that sends.** `POST /api/push/dispatch` stays read-only.

It needs everything the dispatch route needs, **plus** `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `PUSH_SEND_ENABLED=true`. Generate a
keypair once with `npx web-push generate-vapid-keys` and put the **same public
key** in `VAPID_PUBLIC_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

```
curl -X POST https://<primary-host>/api/push/send \
  -H "Authorization: Bearer $PUSH_DISPATCH_SECRET"
```

It reuses `PUSH_DISPATCH_SECRET`; `PUSH_SEND_ENABLED` is what separates
looking from sending.

| Status | Meaning |
|---|---|
| `200` | A run happened. Body below. |
| `401` | Missing or wrong bearer secret. |
| `405` | Any method other than `POST`. |
| `421` | Request resolved to a non-default tenant — call the primary host. |
| `502` | A store read or the catalog read failed, or the run failed unexpectedly. Nothing was sent or recorded on a failed read. |
| `503` | Secret, store, VAPID keys or `PUSH_SEND_ENABLED` not configured, or `VAPID_PUBLIC_KEY` differs from `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. One fixed body for all of them. |

`200` body — counts only, never an endpoint, key, slug or version:

```json
{
  "counts": { "notify": 12, "baseline": 0, "deferred": 0, "messages": 1,
              "attempted": 1, "sent": 0, "gone": 0, "failed_retryable": 1,
              "failed_permanent": 0, "unsent": 0, "capped": 0, "pruned": 0,
              "prune_failed": 0, "held_back": 1, "recorded": 11 },
  "stopped_early": false,
  "anomaly": false,
  "baseline_write": "ok"
}
```

- **Call it again** when `counts.deferred > 0` (the plan hit `MAX_PLAN`),
  `stopped_early` is `true` (the 40 s budget ran out), `counts.capped > 0`
  (a device hit its 10-messages-per-run cap) or `counts.held_back > 0`
  (a send failed transiently, so that app's baseline was not recorded and it
  is retried; a repeated notification is chosen over a missed one).
- `baseline_write: "failed"` means the baselines were not recorded: the next
  run re-plans them, so the worst case is a repeated notification.
- `anomaly: true` means the fan-out skipped something it could not attribute
  to an app, so no `notify` baseline was recorded that run.
- **Function time limit.** The route sets `maxDuration = 60`. The run stops
  starting sends at 40 s and needs at most one 10 s send deadline to finish.
  Vercel clamps `maxDuration` to your plan's limit; if that is under about
  50 s the run can be cut off mid-way (safe — unrecorded baselines are simply
  planned again — but wasteful). Check your plan.
- Runs on the Node.js runtime (`web-push` uses Node's `https` and `crypto`).
