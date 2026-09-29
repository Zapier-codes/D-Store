-- 5.k.xiv.zi — "who do we send to?" as one SQL function.
--
-- Backs `readRecipients` in lib/push-store.ts (5.k.xiv.zo), which feeds the
-- sender (5.k.xvi / 5.k.xvii). For a list of slugs it returns one row per
-- (device, slug) that has a subscription: the device's `endpoint`, `p256dh`
-- and `auth` (what web-push needs to encrypt and deliver) plus the slug.
--
-- Depends on 20260929120000_create_push_subscription_tables.sql (5.k.i.zi).
--
-- The max_rows = 1000 cap (supabase/config.toml) — DECISION, recorded:
--   PostgREST cuts any response at `max_rows` rows and says nothing. A
--   recipient list is one row per (device, slug), so it can outgrow that, and
--   a silently truncated list must never look complete: sending to part of it
--   and then recording the version as notified would drop alerts for good.
--   So this function PAGES with a keyset cursor instead of returning
--   everything:
--     * `p_limit` is clamped to 1..500, always below `max_rows`, so PostgREST
--       can never truncate a page. A page shorter than the limit the caller
--       asked for is the last page; a full page means "ask again".
--     * The cursor is the last row's (endpoint, slug). Pass it back as
--       `p_after_endpoint` / `p_after_slug` to get the next page. Both null
--       means the first page. Exactly one of them null raises, so a
--       half-formed cursor cannot silently restart from the top.
--     * Rows are ordered by (endpoint, slug) in plain byte order
--       (`collate "C"`), so the order does not depend on the database
--       locale, is total (endpoint is unique, and (subscription, slug) is the
--       primary key), and keeps one device's rows together for fan-out.
--     * A cursor is a comparison, not an offset, so a subscription added or
--       removed between pages cannot make rows repeat or be skipped for the
--       part of the list already passed.
--   The caller (5.k.xiv.zo) owns the loop, and treats a failure on any page
--   as the whole read being unavailable.
--
--   p_slugs  null or empty returns zero rows. More than 1000 entries raises
--            (the plan is capped far below that, so this is a bug guard).
--   returns  endpoint, p256dh, auth, slug.
--   stable   reads only, same answer within one statement.
--
-- Privileges — same posture as replace_push_subscription and
-- subscribed_slugs. Supabase grants EXECUTE on new functions in `public` to
-- anon and authenticated by default and exposes them as /rpc/<name> with the
-- public anon key. THIS FUNCTION RETURNS SECRETS (endpoints and encryption
-- keys), so the revoke below is not optional. Only service_role (server-side
-- code; its key is never sent to a browser) may call it. Backstop: the
-- function is `security invoker`, so if the revoke were ever lost, anon's
-- call would still read the tables under RLS (on, no policies) and see
-- nothing. The revoke is the primary control, RLS the backstop.
-- This migration must be run on Supabase, or on Postgres that has the
-- anon/authenticated/service_role roles.

create or replace function public.push_recipients(
  p_slugs text[],
  p_after_endpoint text default null,
  p_after_slug text default null,
  p_limit integer default 500
)
returns table (endpoint text, p256dh text, auth text, slug text)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 500);
begin
  if (p_after_endpoint is null) <> (p_after_slug is null) then
    raise exception 'push_recipients: cursor needs both p_after_endpoint and p_after_slug, or neither'
      using errcode = '22023';
  end if;

  if p_slugs is null or cardinality(p_slugs) = 0 then
    return;
  end if;

  if cardinality(p_slugs) > 1000 then
    raise exception 'push_recipients: too many slugs (max 1000)'
      using errcode = '22023';
  end if;

  return query
    select s.endpoint, s.p256dh, s.auth, a.slug
    from push_subscription s
    join push_subscription_app a on a.subscription_id = s.id
    where a.slug = any (p_slugs)
      and (
        p_after_endpoint is null
        or (s.endpoint collate "C", a.slug collate "C")
             > (p_after_endpoint collate "C", p_after_slug collate "C")
      )
    order by s.endpoint collate "C", a.slug collate "C"
    limit v_limit;
end;
$$;

revoke all on function public.push_recipients(text[], text, text, integer)
  from public, anon, authenticated;
grant execute on function public.push_recipients(text[], text, text, integer)
  to service_role;
