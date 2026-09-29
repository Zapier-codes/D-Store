-- 5.k.vii.zi — atomic "replace this device's subscription" function.
--
-- Backs `lib/push-store.ts` (5.k.vii.zo). Replacing a device's slug set is
-- "upsert the subscription, delete its old slugs, insert the new ones".
-- Done as separate PostgREST calls that is three round trips, and a failure
-- between the delete and the insert leaves a device subscribed to nothing.
-- One function call runs in one transaction, so it either all happens or
-- none of it does.
--
-- Depends on 20260929120000_create_push_subscription_tables.sql (5.k.i.zi).
--
-- Inputs are NOT trusted beyond what the table constraints already enforce
-- (endpoint must be https, columns not null). Real validation lives in
-- lib/push-validate.ts; a value that gets past it and still violates a
-- constraint makes this function raise, which rolls the whole call back and
-- leaves the previous slug set untouched.
--
--   p_slugs  may be empty or null (both mean "no apps": the subscription row
--            stays, its slug set becomes empty). Duplicates are collapsed.
--            A null element raises (slug is not null) and rolls back.
--
-- Concurrency: two calls for the same endpoint serialize on the
-- push_subscription row lock taken by the upsert, so the later call's slug
-- set wins in full rather than the two interleaving.
--
-- Privileges — the part that matters. Supabase grants EXECUTE on new
-- functions in `public` to anon and authenticated by default and exposes them
-- as /rpc/<name> with the public anon key, so without the revoke below anyone
-- could call this function. Only service_role (server-side code; its key is
-- never sent to a browser) may. Defence in depth: the function is
-- `security invoker`, so if the revoke were ever lost, anon's call would still
-- hit RLS on push_subscription (on, no policies) and fail — verified when this
-- leaf was built. The revoke is the primary control, RLS the backstop.
-- This migration must be run on Supabase, or on Postgres that has the
-- anon/authenticated/service_role roles.

create or replace function public.replace_push_subscription(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text,
  p_slugs    text[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into push_subscription (endpoint, p256dh, auth)
  values (p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set p256dh       = excluded.p256dh,
        auth         = excluded.auth,
        last_seen_at = now()
  returning id into v_id;

  delete from push_subscription_app where subscription_id = v_id;

  insert into push_subscription_app (subscription_id, slug)
  select v_id, s
  from (select distinct unnest(coalesce(p_slugs, '{}'::text[]))) as t(s);
end;
$$;

revoke all on function public.replace_push_subscription(text, text, text, text[])
  from public, anon, authenticated;
grant execute on function public.replace_push_subscription(text, text, text, text[])
  to service_role;
