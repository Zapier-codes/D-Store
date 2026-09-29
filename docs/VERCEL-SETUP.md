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

## Web Push environment variables (leaf 5.k.xiii.zo)

Web Push for saved-app updates (track `5.k`) reads four environment
variables. **None are required for the site to build or run** — with all four
unset the storefront works exactly as before, the "Notify me about updates"
control renders nothing, and the dispatch route fails closed. Set them in
Vercel → Project → Settings → Environment Variables.

| Variable | Scope | Purpose |
|---|---|---|
| `SUPABASE_URL` | server-only | Project URL of D-Store's **own** Supabase project (never Zealot's). |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only — never `NEXT_PUBLIC_`** | Service-role key used by `lib/push-store.ts` for the subscription tables. Bypasses RLS, so it must never reach the browser. |
| `PUSH_DISPATCH_SECRET` | server-only | Shared secret for `POST /api/push/dispatch`. **At least 32 characters, no whitespace.** Unset or shorter answers `503` (fails closed). |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | public (inlined at build) | VAPID public key. While unset, the opt-in control renders nothing and nothing is collected. |

**Two warnings that hold today — do not skip them:**

1. **Keep `SUPABASE_SERVICE_ROLE_KEY` unset in production until `5.k.vi.zo`
   (subscribe/unsubscribe throttling, currently Held) lands.** With it set,
   the public subscribe/unsubscribe routes accept unthrottled writes.
2. **Keep `NEXT_PUBLIC_VAPID_PUBLIC_KEY` unset until the sender
   (`5.k.iii.zo`) exists.** Until then a visitor who opts in would be
   subscribed to notifications nothing sends. `NEXT_PUBLIC_` values are
   inlined at build time, so changing it needs a redeploy.

### `POST /api/push/dispatch` (read-only plan)

Computes the plan for the next Web Push run. **It writes nothing and sends
nothing**; the sender (`5.k.iii.zo`) consumes exactly this response.

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
