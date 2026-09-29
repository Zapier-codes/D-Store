-- 5.k.i.zi — Web Push subscription storage (anonymous, per device).
--
-- Backs the Web Push track (5.k), split out of 5.c.i.zo. Three new tables, all
-- `create table` — nothing here alters an existing table.
--
--   push_subscription       one row per browser/device that opted in. The
--                           endpoint is the push service's URL for that device;
--                           p256dh/auth are that subscription's encryption keys
--                           (RFC 8291). NO user id, NO account — D-Store has
--                           none, and this stays anonymous by design.
--   push_subscription_app   which apps a subscription wants update alerts for,
--                           by catalog slug. Keyed by slug text, deliberately
--                           NOT a foreign key to `application`: the live catalog
--                           comes from Zealot's signed index (and Aptoide), so
--                           an app a visitor saved need not have an
--                           `application` row.
--   push_notified_version   the diff baseline for 5.k.iii: the last version we
--                           sent an alert for, per slug. The dispatch endpoint
--                           compares the current catalog against this so a
--                           repeated call sends nothing new.
--
-- Row Level Security is ON with no policies. `endpoint`, `p256dh` and `auth`
-- together are enough to send a push to a device, and Supabase exposes the
-- `public` schema through its API with the anon key, so without RLS anyone
-- holding that key could read them. With RLS on and no policy, only the
-- service role (which bypasses RLS) can touch these tables — which is exactly
-- who the 5.k.i.zo route handlers and 5.k.iii sender are. The earlier
-- migrations in this directory carry no RLS; that is not a precedent to copy
-- for secret-bearing rows.
--
-- `endpoint` is constrained to https:// because the Push API only issues https
-- endpoints; the route handler (5.k.i.zo) validates too, this is the backstop.
--
-- Uses gen_random_uuid(), built in from Postgres 13 (no extension needed).

create table public.push_subscription (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.push_subscription_app (
  subscription_id uuid not null references public.push_subscription(id) on delete cascade,
  slug text not null,
  primary key (subscription_id, slug)
);

-- Fan-out lookup: "who wants alerts for this slug?"
create index push_subscription_app_slug_idx
  on public.push_subscription_app (slug);

create table public.push_notified_version (
  slug text primary key,
  version text not null,
  notified_at timestamptz not null default now()
);

alter table public.push_subscription enable row level security;
alter table public.push_subscription_app enable row level security;
alter table public.push_notified_version enable row level security;
