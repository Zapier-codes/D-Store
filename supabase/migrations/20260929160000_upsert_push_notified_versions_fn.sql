-- 5.k.xv.zi — atomic "record these notified versions" function.
--
-- Backs `writeNotifiedVersions` in lib/push-store.ts (5.k.xv.zo). After a
-- dispatch run, the caller records, per slug, the version it has now dealt
-- with (a `baseline` entry, or a `notify` entry that qualifies — the caller
-- decides which, 5.k.xvii.zi). `buildPlan` (lib/push-plan.ts) reads these rows
-- back as its baselines. Done as one PostgREST upsert per slug that would be
-- N round trips with a failure halfway leaving some apps recorded and some
-- not; one function call runs in one transaction, so it is all or nothing.
--
-- Depends on 20260929120000_create_push_subscription_tables.sql (5.k.i.zi),
-- which creates public.push_notified_version (slug pk, version, notified_at).
--
--   p_slugs     slugs to record, one-dimensional, no nulls, no blanks, no
--   p_versions  duplicates. Parallel to p_versions: element i of one belongs
--               with element i of the other.
--
--   raises      (errcode 22023 `invalid_parameter_value`, which rolls the
--               whole call back and leaves every existing row untouched) when:
--               either array is null; the two lengths differ; either array is
--               not one-dimensional; any element of either is null or blank;
--               a slug appears twice. A duplicate is refused rather than
--               "last one wins" on purpose: buildPlan emits at most one entry
--               per slug, so a duplicate means the caller has a bug, and
--               guessing which version to keep would record a baseline nobody
--               chose. (Left to the insert, it would also fail, with Postgres's
--               generic "cannot affect row a second time".)
--   empty       two empty arrays are a no-op that returns 0 (a plan with
--               nothing to record is not an error).
--   upsert      a new slug is inserted; an existing slug has its `version` set
--               to the given one and `notified_at` set to now(), whether the
--               version is newer, older or the same. Older is deliberate:
--               classifyApp compares by inequality, so a rollback is a real
--               version change and the baseline must follow it or the app
--               would notify again on every run. Same version refreshes
--               notified_at only.
--   returns     the number of rows written (inserted or updated), an integer.
--
-- Inputs are not trusted beyond the checks above. Real validation of slugs and
-- versions lives in lib/push-plan.ts (normalizeVersion) and
-- lib/push-validate.ts; this function does not re-check the slug pattern, only
-- that nothing is null or blank.
--
-- Privileges — the part that matters. Supabase grants EXECUTE on new
-- functions in `public` to anon and authenticated by default and exposes them
-- as /rpc/<name> with the public anon key, so without the revoke below anyone
-- could rewrite the diff baseline (and so suppress or trigger alerts). Only
-- service_role (server-side code; its key is never sent to a browser) may
-- call it. Defence in depth: the function is `security invoker`, so if the
-- revoke were ever lost, anon's call would still hit RLS on
-- push_notified_version (on, no policies) and fail. The revoke is the primary
-- control, RLS the backstop.
-- This migration must be run on Supabase, or on Postgres that has the
-- anon/authenticated/service_role roles.

create or replace function public.upsert_push_notified_versions(
  p_slugs    text[],
  p_versions text[]
)
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_slugs is null or p_versions is null then
    raise exception 'p_slugs and p_versions must not be null'
      using errcode = '22023';
  end if;

  if coalesce(array_ndims(p_slugs), 1) <> 1
     or coalesce(array_ndims(p_versions), 1) <> 1 then
    raise exception 'p_slugs and p_versions must be one-dimensional'
      using errcode = '22023';
  end if;

  if cardinality(p_slugs) <> cardinality(p_versions) then
    raise exception 'p_slugs and p_versions must have the same length'
      using errcode = '22023';
  end if;

  if cardinality(p_slugs) = 0 then
    return 0;
  end if;

  if exists (
       select 1 from unnest(p_slugs) as t(s)
       where t.s is null or btrim(t.s) = ''
     )
     or exists (
       select 1 from unnest(p_versions) as t(v)
       where t.v is null or btrim(t.v) = ''
     ) then
    raise exception 'slugs and versions must not be null or blank'
      using errcode = '22023';
  end if;

  if (select count(*) <> count(distinct t.s) from unnest(p_slugs) as t(s)) then
    raise exception 'p_slugs must not contain duplicates'
      using errcode = '22023';
  end if;

  insert into push_notified_version (slug, version, notified_at)
  select t.s, t.v, now()
  from unnest(p_slugs, p_versions) as t(s, v)
  on conflict (slug) do update
    set version     = excluded.version,
        notified_at = excluded.notified_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.upsert_push_notified_versions(text[], text[])
  from public, anon, authenticated;
grant execute on function public.upsert_push_notified_versions(text[], text[])
  to service_role;
