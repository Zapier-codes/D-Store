-- 5.l.xii.zo — `catalog_page` gains two optional filters, `p_license` and `p_max_size_mb`, and a
-- small companion, `catalog_licenses`, lists the licenses a category holds. NEEDS THE OPERATOR:
-- apply this file (psql -f, or the Supabase SQL editor); nothing in the code can.
--
-- Why a drop and a create, not just a create or replace: `catalog_page` is identified by its
-- argument types, so adding two parameters with `create or replace` would make a SECOND function
-- beside the old seven-argument one. PostgREST matches a call by the argument names it is sent, and
-- a call that sends only the old seven would then fit both functions and fail as ambiguous. So the
-- old signature is dropped and the new one is created in one transaction, with the two new
-- parameters defaulting to null: every existing caller (lib/catalog-table.ts before this leaf, which
-- never sends them) keeps working unchanged the moment this runs, and no request can land between
-- the drop and the create.
--
-- What the filters are: `license = p_license` (exact, case-sensitive, as getApps compares) and
-- `size_mb <= p_max_size_mb`, added to the same shared `where` as the scope and the needle, so the
-- cursor's two arms and a search apply them identically. A blank license and a negative size are
-- raised (SQLSTATE 22023) rather than answered with an empty page, like the other bad arguments.
--
-- What it costs, said plainly because it was not measured (no Postgres here): license and size
-- are "not indexed, deliberately" (20261002000000_create_catalog_app.sql). With a category in scope
-- the planner still walks that category's (app_type, category, ...) index range in order and tests
-- each row against the filter, so a page costs up to one category's rows (hundreds, a few thousand
-- at the 10,000-row target), not the table. Without a category (a filter on all apps) it would walk
-- the whole top or new index; nothing calls it that way yet. If a tight filter on a big category
-- turns out slow, the fix is an index (for example on (app_type, category, license)), not code.
--
-- `catalog_licenses(p_app_type, p_category)`: the distinct, published, non-blank licenses of at
-- most 100 characters in one category, sorted, at most 100 of them. It feeds the category page's
-- license dropdown, so the dropdown offers only licenses that category has (an option that always
-- returned nothing would be a bug, as CategoryFilters' own comment says). Licenses longer than 100
-- characters are left out of the list because lib/catalog-table.ts refuses a longer filter value.
--
-- Same privileges as before: execute revoked from public, anon and authenticated, granted to
-- service_role only. Safe to re-run: `drop function if exists`, `create or replace`, idempotent
-- revoke/grant.

begin;

drop function if exists public.catalog_page(text, text, text, text, text, text, integer);

create or replace function public.catalog_page(
  p_order       text,
  p_app_type    text    default null,
  p_category    text    default null,
  p_needle      text    default null,
  p_after_value text    default null,
  p_after_slug  text    default null,
  p_limit       integer default 24,
  p_license     text    default null,
  p_max_size_mb numeric default null
)
returns table (
  id                 text,
  slug               text,
  package_name       text,
  origin             text,
  name               text,
  summary            text,
  icon               text,
  version            text,
  app_type           text,
  category           text,
  developer_slug     text,
  developer_name     text,
  license            text,
  size_mb            numeric,
  download_url       text,
  reported_downloads bigint,
  source_created_at  timestamptz,
  source_updated_at  timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  c_cols constant text :=
    'id, slug, package_name, origin, name, summary, icon, version, app_type, category, '
    || 'developer_slug, developer_name, license, size_mb, download_url, reported_downloads, '
    || 'source_created_at, source_updated_at';

  v_limit   integer := least(greatest(coalesce(p_limit, 24), 1), 101);
  v_value   text;     -- the sort expression, as written on the table
  v_outer   text;     -- the same sort, over the union's output columns
  v_cast    text;     -- the sort value's type, for the cursor parameter
  v_where   text := ' where is_published';
  v_pattern text;
  v_arm     text;
  v_sql     text;
begin
  if p_order = 'top' then
    v_value := 'coalesce(reported_downloads, -1)';
    v_outer := 'coalesce(t.reported_downloads, -1)';
    v_cast  := 'bigint';
  elsif p_order = 'new' then
    v_value := 'source_updated_at';
    v_outer := 't.source_updated_at';
    v_cast  := 'timestamptz';
  else
    raise exception 'catalog_page: order must be top or new' using errcode = '22023';
  end if;

  if p_category is not null and p_app_type is null then
    raise exception 'catalog_page: a category needs an app_type' using errcode = '22023';
  end if;

  if (p_after_value is null) <> (p_after_slug is null) then
    raise exception 'catalog_page: a cursor needs both a value and a slug' using errcode = '22023';
  end if;

  if p_license is not null and btrim(p_license) = '' then
    raise exception 'catalog_page: a license filter must not be blank' using errcode = '22023';
  end if;

  if p_max_size_mb is not null and p_max_size_mb < 0 then
    raise exception 'catalog_page: a size filter must not be negative' using errcode = '22023';
  end if;

  -- $1 app_type, $2 category, $3 pattern, $4 cursor value, $5 cursor slug, $6 limit,
  -- $7 license, $8 max size in MB
  if p_category is not null then
    v_where := v_where || ' and app_type = $1 and category = $2';
  elsif p_app_type is not null then
    v_where := v_where || ' and app_type = $1';
  end if;

  if p_needle is not null then
    if btrim(p_needle) = '' then
      return;  -- a blank search matches nothing
    end if;
    v_pattern := '%'
      || replace(replace(replace(left(btrim(p_needle), 100), '\', '\\'), '%', '\%'), '_', '\_')
      || '%';
    v_where := v_where || ' and (name ilike $3 or summary ilike $3)';
  end if;

  -- 5.l.xii.zo: the two filters join the shared where, so both arms of a cursor read, and a
  -- search, apply them the same way. Equality on license and `<=` on size_mb, exactly the tests
  -- getApps applies in memory today.
  if p_license is not null then
    v_where := v_where || ' and license = $7';
  end if;
  if p_max_size_mb is not null then
    v_where := v_where || ' and size_mb <= $8';
  end if;

  if p_after_value is null then
    v_sql := 'select ' || c_cols || ' from public.catalog_app' || v_where
          || ' order by ' || v_value || ' desc, slug asc limit $6';
  else
    -- Two ranges, each ordered and limited on its own, then merged.
    v_arm := 'select ' || c_cols || ' from public.catalog_app' || v_where;
    v_sql := 'select ' || c_cols || ' from (('
          || v_arm || ' and ' || v_value || ' = $4::' || v_cast || ' and slug > $5'
          || ' order by slug asc limit $6)'
          || ' union all ('
          || v_arm || ' and ' || v_value || ' < $4::' || v_cast
          || ' order by ' || v_value || ' desc, slug asc limit $6)) t'
          || ' order by ' || v_outer || ' desc, t.slug asc limit $6';
  end if;

  return query execute v_sql
    using p_app_type, p_category, v_pattern, p_after_value, p_after_slug, v_limit, p_license, p_max_size_mb;
end;
$$;

comment on function public.catalog_page(text, text, text, text, text, text, integer, text, numeric) is
  '5.l.i.zo, filters added by 5.l.xii.zo. One page of published catalog_app rows (no raw), in top or new order, optionally one app_type/category, a substring search over name or summary, an exact license and/or a maximum size in MB, after an optional (sort value, slug) cursor. service_role only.';

revoke all on function public.catalog_page(text, text, text, text, text, text, integer, text, numeric)
  from public, anon, authenticated;
grant execute on function public.catalog_page(text, text, text, text, text, text, integer, text, numeric)
  to service_role;

create or replace function public.catalog_licenses(
  p_app_type text,
  p_category text
)
returns table (license text)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_app_type is null or p_category is null then
    raise exception 'catalog_licenses: an app_type and a category are required' using errcode = '22023';
  end if;

  return query
    select distinct c.license
    from public.catalog_app c
    where c.is_published
      and c.app_type = p_app_type
      and c.category = p_category
      and char_length(c.license) between 1 and 100
    order by c.license
    limit 100;
end;
$$;

comment on function public.catalog_licenses(text, text) is
  '5.l.xii.zo. The distinct published licenses (1 to 100 characters) of one app_type/category, sorted, at most 100. service_role only.';

revoke all on function public.catalog_licenses(text, text) from public, anon, authenticated;
grant execute on function public.catalog_licenses(text, text) to service_role;

commit;
