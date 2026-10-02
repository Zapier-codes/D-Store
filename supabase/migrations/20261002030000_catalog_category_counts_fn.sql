-- 5.l.xiii.zo — `catalog_category_counts`: published `catalog_app` rows counted per (app_type, category)
-- in one grouped query. NEEDS THE OPERATOR: apply this file (psql -f, or the Supabase SQL editor);
-- nothing in the code can.
--
-- Why: the `/categories` index shows a count for each of the 49 vocabulary entries (32 app categories,
-- 17 game genres). Before this leaf each count was one whole-catalog pass (49 passes over every app).
-- PostgREST cannot group, so a plain select cannot answer this; one function can: one pass over the
-- (app_type, category, ...) indexes, a few dozen rows back.
--
-- What it counts: published rows only, grouped by the STORED pair (app_type, category). That is the
-- same comparison `appInTaxonomyCategory` makes in code (a direct comparison of the stored pair; the
-- read-time category shim the leaf text mentions was removed by 5.i.vii.zo, so there is nothing to
-- translate here). Rows the merged catalog would drop are left out, the same rule the footer count
-- (5.l.xiii.zi) uses: a third-party row whose package name or slug belongs to a first-party app shows
-- only the first-party entry, so the caller passes the first-party package names and slugs and they
-- are excluded here. The caller adds the first-party apps' own counts itself (they are not rows).
--
-- Arguments: p_exclude_packages and p_exclude_slugs, text arrays, null or empty meaning "exclude
-- nothing". They travel in the POST body, not the URL. A null element is ignored. More than 1000
-- elements in either array is raised (SQLSTATE 22023): the caller never sends more than 200.
--
-- Returns one row per (app_type, category) that has at least one counted row; categories with no rows
-- are simply absent (the caller reads absent as 0). `total` is bigint (PostgREST sends it as a JSON
-- number).
--
-- Cost, said plainly because it was not measured (no Postgres here): it reads every published row's
-- (app_type, category) once, from the index when the planner chooses the index-only scan, otherwise
-- from the heap, never touching `raw`. At the 10,000-row target that is one small scan, once per
-- cache lifetime (the caller caches the answer for five minutes), instead of 49 passes over 10,000
-- fully built apps on every render.
--
-- Same privileges as the other catalog functions: execute revoked from public, anon and
-- authenticated, granted to service_role only. Safe to re-run: `create or replace`, idempotent
-- revoke/grant.

begin;

create or replace function public.catalog_category_counts(
  p_exclude_packages text[] default null,
  p_exclude_slugs    text[] default null
)
returns table (
  app_type text,
  category text,
  total    bigint
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if coalesce(array_length(p_exclude_packages, 1), 0) > 1000
     or coalesce(array_length(p_exclude_slugs, 1), 0) > 1000 then
    raise exception 'catalog_category_counts: at most 1000 excluded packages and 1000 excluded slugs'
      using errcode = '22023';
  end if;

  return query
    select c.app_type, c.category, count(*)::bigint
    from public.catalog_app c
    where c.is_published
      and (p_exclude_packages is null or not (c.package_name = any (array_remove(p_exclude_packages, null))))
      and (p_exclude_slugs is null or not (c.slug = any (array_remove(p_exclude_slugs, null))))
    group by c.app_type, c.category
    order by c.app_type, c.category;
end;
$$;

comment on function public.catalog_category_counts(text[], text[]) is
  '5.l.xiii.zo. Published catalog_app rows per (app_type, category), minus rows owned by the given first-party packages and slugs. service_role only.';

revoke all on function public.catalog_category_counts(text[], text[]) from public, anon, authenticated;
grant execute on function public.catalog_category_counts(text[], text[]) to service_role;

commit;
