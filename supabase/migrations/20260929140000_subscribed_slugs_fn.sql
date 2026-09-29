-- 5.k.xi.zi — "which apps does anyone want alerts for?" as one SQL function.
--
-- Backs `readDispatchState` in lib/push-store.ts (5.k.xi.zo), which feeds
-- `buildPlan`'s `subscribedSlugs` (lib/push-plan.ts). The dispatch job only
-- needs the DISTINCT set of slugs that have at least one subscriber, not one
-- row per (device, slug).
--
-- Why a function and not a plain PostgREST read of push_subscription_app:
-- PostgREST has no DISTINCT, so `select=slug` returns one row per
-- (device, slug), and `max_rows = 1000` (supabase/config.toml) silently cuts
-- that off long before the distinct list would be that big. 50 devices that
-- all saved the same 30 apps is 1500 rows for 30 answers. The function
-- collapses the duplicates inside Postgres, so the result is as small as the
-- answer. It is still subject to `max_rows`: a page of exactly `max_rows`
-- rows must be treated by the caller as "unavailable", never as a complete
-- list (5.k.xi.zo owns that rule).
--
-- Depends on 20260929120000_create_push_subscription_tables.sql (5.k.i.zi).
--
--   returns  one row per distinct slug, ordered by slug in plain byte order
--            (`collate "C"`). buildPlan sorts by code unit, and every valid
--            slug is ASCII (`[a-z0-9]` with single hyphens, see
--            lib/push-validate.ts), so byte order and code-unit order are the
--            same thing. Pinning the collation keeps that true whatever the
--            database's default locale is: under a glibc locale such as
--            en_US.UTF-8, hyphens are ignored on the first pass, so `a-c`
--            would sort after `ab` there and before it here.
--   empty    an empty push_subscription_app returns zero rows, not an error.
--   stable   reads only, same answer within one statement.
--
-- Privileges — same posture as replace_push_subscription. Supabase grants
-- EXECUTE on new functions in `public` to anon and authenticated by default
-- and exposes them as /rpc/<name> with the public anon key, so without the
-- revoke below anyone could ask which apps have subscribers. Only service_role
-- (server-side code; its key is never sent to a browser) may call it.
-- Backstop: the function is `security invoker`, so if the revoke were ever
-- lost, anon's call would still read push_subscription_app under RLS (on, no
-- policies) and see nothing. Unlike the write function, which fails loudly,
-- this one fails quietly, returning zero rows rather than raising. Verified
-- when this leaf was built. The revoke is the primary control, RLS the
-- backstop.
-- This migration must be run on Supabase, or on Postgres that has the
-- anon/authenticated/service_role roles.

create or replace function public.subscribed_slugs()
returns table (slug text)
language sql
stable
security invoker
set search_path = public
as $$
  select a.slug
  from push_subscription_app a
  group by a.slug
  order by a.slug collate "C";
$$;

revoke all on function public.subscribed_slugs()
  from public, anon, authenticated;
grant execute on function public.subscribed_slugs()
  to service_role;
