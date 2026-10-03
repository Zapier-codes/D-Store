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

---

## Catalog source (leaf 5.l.xvii.zi)

The third-party (Aptoide-origin) catalog is read from the `catalog_app` table in D-Store's own
Supabase project whenever `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. There is nothing
else to switch on.

**`CATALOG_SOURCE` is no longer needed and is no longer read.** It used to have to be `table`; any
value, or none, is now ignored. You can delete it from Vercel. Before the Supabase variables are set
on a deployment, or if they are removed, the site shows first-party apps only. **The bundled Aptoide
snapshot (`storage/downloads/aptoide-snapshot*.json`) is no longer read at request time and is no longer
shipped inside the serverless functions (leaf `5.l.xix.zo`).** The files stay in the repo only as import
data for `scripts/load-catalog-table.ts`, `check-catalog-table.ts`, `rederive-catalog-categories.ts` and the
crawl workflow.

Check it is working after a deploy: `npx tsx scripts/check-catalog-table.ts` compares the table with
the snapshot and prints counts, and the footer total should match the table's published row count.

## Moderation access (leaf 3.c.vi.zo)

The moderation queue lives under `/moderation` and `/api/moderation/*`, **outside** `/admin`. Moderators sign in **individually**, with a generated token each, not with the shared `ADMIN_PASSWORD`. The shared password never opens `/moderation`, and a moderator token never opens `/admin`. **Nothing here is required for the site to build or run**: with the variable unset, every `/moderation` and `/api/moderation` request answers `503` to everyone (fails closed) and the rest of the site is unchanged.

| Variable | Scope | Purpose |
|---|---|---|
| `MODERATOR_TOKENS` | **server-only — never `NEXT_PUBLIC_`** | A JSON array of `{ "id": "...", "sha256": "..." }`, one entry per moderator. `sha256` is the lowercase hex SHA-256 of that moderator's token, so **the token itself is never in Vercel**. |

Rules the gate enforces (`lib/moderator-auth.ts`): an `id` is 2 to 32 characters, lowercase letters, digits, `.`, `_` or `-`, starting with a letter or digit; at most **20** entries; `sha256` is exactly 64 lowercase hex characters; a token is **32 to 256 characters with no whitespace**. **One bad entry, a repeated id, a repeated digest, or JSON that does not parse makes the whole value unusable**: every moderator is then answered `503` until it is fixed, never "open". An extra key on an entry (for example `"note": "Alice, backup"`) is ignored, so you can label entries.

### Add a moderator

1. On your own machine (not in Vercel, not in a shared terminal), run `npx tsx scripts/new-moderator-token.ts <id>`. It prints a token **once** and the entry to paste.
2. Give the token to the moderator **privately** (a password manager share, not chat history or email). It cannot be shown again; if it is lost, issue a new one.
3. Add the printed `{ "id", "sha256" }` object to the `MODERATOR_TOKENS` array in Vercel → Project → Settings → Environment Variables (Production), then redeploy.
4. Check the value before saving: `MODERATOR_TOKENS='<the whole value>' npx tsx scripts/new-moderator-token.ts --check` lists the ids it contains (never digests) or says what is wrong.
5. The moderator signs in with their **id as the username** and the **token as the password**. `GET /api/moderation/ping` returns `{ "moderator": "<id>" }` and is the quickest way to confirm a token works.

### Revoke a moderator

Delete their entry from `MODERATOR_TOKENS` and redeploy. There is nothing else to rotate: the token is only ever checked against the digest in that list. To rotate a token, issue a new one with the same id and replace the entry.

### Notes

- **Why a generated token and a fast hash.** The gate hashes with SHA-256, which is only safe because a token is machine-generated and long (`openssl rand -base64 24` or the script give 32 characters). **If a person is ever allowed to choose their own password, this must change to a slow, salted hash first.**
- **No throttling of failed sign-ins in the gate.** The shared limiter uses `node:crypto` and cannot run in the Edge middleware; with tokens this long guessing is not a practical attack. If noise control is wanted it belongs in the Node handler layer.
- **A bad config says why in the server log**, once per distinct reason (`[moderation] disabled — MODERATOR_TOKENS is invalid: entry 1 has a missing or malformed id`). The message never contains an id, a digest or a token.
- **Basic auth has no logout.** A browser keeps the credentials until it is closed; the admin pages are the same.
- **Every response under these prefixes** carries `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`. A mutating request (`POST`, `PATCH`, `PUT`, `DELETE`) must also carry an `Origin` matching the host, or it is refused with `403`, because browsers re-send Basic credentials on cross-site requests.

## Stats for Zealot's admin (leaf 5.g.v.zo)

`GET /api/stats` returns one JSON document of aggregates (traffic, top searches, report counts, review aggregates) for Zealot's admin page (Zealot Task 31b). **Nothing here is required for the site to build or run**: with the token unset the route answers `503` to everyone and the rest of the site is unchanged.

| Variable | Scope | Purpose |
|---|---|---|
| `STATS_READ_TOKEN` | **server-only — never `NEXT_PUBLIC_`** | The bearer token Zealot sends. **At least 32 characters, no whitespace** (`openssl rand -base64 24` gives 32). Its own secret: not `PUSH_DISPATCH_SECRET`, not `ADMIN_PASSWORD`, so each can be rotated or leaked on its own. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | Already used by the other routes; the route reads `store_stats()` with them. |

**Counters and the search log.** With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set (the same two the push and stats routes use) and the migrations applied, `POST /api/apps/<slug>/install` and `/view` count in `app_counter` and each search is recorded in `search_log` (normalized text only). Unset, or if the database does not answer, the routes fall back to the in-memory count and nothing breaks, but Zealot's stats page shows zeros.

On the Zealot deployment set `DSTORE_STATS_URL` to `https://<this site>/api/stats` and `DSTORE_STATS_TOKEN` to the same value as `STATS_READ_TOKEN`.

- **Why `/api/stats` and not `/api/admin/stats`.** Everything under `/api/admin/` is behind the shared-password Basic gate in `middleware.ts`, which would refuse Zealot's bearer token before the route ran. An earlier version of this route was at `/api/admin/stats` and could not have served Zealot.
- **Statuses.** `401` for a missing, malformed or wrong header (the three look the same); `503` when `STATS_READ_TOKEN` is unset, too short or has whitespace, or when Supabase is not configured; `502` when the database could not be read; `200` with the document otherwise. Every answer is `Cache-Control: no-store`. Only `GET` exists.
- **What it returns, and what it never does.** Only the keys the contract names (see the header of `supabase/migrations/20260930100200_store_stats_fn.sql` and `lib/stats-store.ts`): no review text, no `ip_hash`, no report `details`, no per-search times. The document is validated and rebuilt, so a column added to the SQL function later cannot reach Zealot until `lib/stats-store.ts` and Zealot's `DstoreStats::Document` both change.
- **Quick check.** `curl -H "Authorization: Bearer $STATS_READ_TOKEN" https://<this site>/api/stats` should print the document; without the header it prints `{"error":"Unauthorized"}`.
- **Before it shows anything real,** the stats migrations (`20260930100000` to `20260930100300`) must be applied to the Supabase project (`scripts/apply-migrations.sh`) **together with `20260930100300_enable_rls_on_original_tables.sql`**, and the counters in `lib/catalog.ts` must be pointed at the database (the `(d)` part of leaf `5.g.v.zo`, still open); until then the figures are zeros.

## Database migrations (leaf 5.l.xxii.zi)

Vercel builds the Next.js app only; it never touches the database. The files in `supabase/migrations/` are applied by the GitHub Actions workflow `.github/workflows/apply-migrations.yml`, which runs `scripts/apply-migrations.sh` (psql, each file in its own transaction, recorded in `supabase_migrations.schema_migrations`, safe to re-run).

| Secret (GitHub → Settings → Secrets and variables → Actions) | Purpose |
|---|---|
| `SUPABASE_DB_URL` | The **D-Store** Supabase project's **session pooler** connection string (Supabase dashboard → Connect → Session pooler), `postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres?sslmode=require`. Not the "Direct connection" (IPv6-only on many plans). **Never Zealot's database.** |

- **When it runs.** On a push to `master` that touches `supabase/migrations/**` or `scripts/apply-migrations.sh`, and by hand (Actions → Apply Supabase migrations → Run workflow). A manual run asks for `dry_run`; the default `true` only lists what would be applied, choose `false` to apply.
- **Secret unset:** the run is green with a notice and does nothing. **Secret not a postgres URL:** the run fails and never prints the value.
- **A migration that fails** turns the run red and leaves the earlier files applied; fix the file and push again, or re-run by hand.
- **Ordering with the code deploy.** A push to `master` also makes Vercel deploy the code, so new code can be live about a minute before its migration. The read paths fail honestly meanwhile (`CatalogUnavailableError`), and the migrations so far are additive, so this is a short window, not a break. A migration that drops or renames something needs its code change split over two pushes.
- **First use:** run it by hand once with `dry_run` = `true` and read the list. If it lists files you already applied by hand with another tool (the Supabase CLI keeps its own record), stop and check `supabase_migrations.schema_migrations` first.
