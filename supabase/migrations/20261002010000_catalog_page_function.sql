-- 5.l.i.zo — `catalog_page`: the paged read and search function over
-- `catalog_app` (table: 20261002000000_create_catalog_app.sql).
--
-- One function, because the three reads the pages need differ in only three
-- ways, and one function has one set of privileges and one cursor rule to get
-- right:
--   order   'top' = reported downloads descending (NULL counts as -1), slug
--           ascending; 'new' = source update time descending, slug ascending.
--           These are the orders getTopFreeApps and getNewAndUpdated use, and
--           they are the orders the table's indexes were built for.
--   scope   all apps, one app_type ('app' or 'game'), or one category inside
--           an app_type (a category slug is only unambiguous with its type).
--   search  a needle: case-insensitive substring over name OR summary, the
--           rule searchApps applies today.
-- lib/catalog-table.ts is the only caller. It calls this over /rest/v1/rpc with
-- the service-role key.
--
-- Rules this file follows, each one written down by 5.l.i.zi:
--   * Published rows only (`is_published`). A take-down hides an app everywhere.
--   * `raw` is never returned. The result is the flat columns only; the detail
--     page reads one row's `raw` by slug (5.l.ii.zi).
--   * The download order is written as `coalesce(reported_downloads, -1)`, the
--     same expression the indexes are built on, or the planner cannot use them.
--   * The cursor is two ranges joined by `union all`, each with its own limit:
--     rows tied with the cursor value that come after its slug, then rows with
--     a smaller value. Measured at 10,000 rows, a single `or` condition cost
--     more the deeper the page (0.1 ms at the start, 4.3 ms at row 9,000);
--     this form stayed flat. A cursor is the sort value of the last row seen
--     and that row's slug ('top': the integer, -1 for NULL; 'new': the
--     timestamp).
--   * The needle is escaped here, not left to the caller: '\', '%' and '_' in a
--     search become literal characters, so a user's `w_ats` is not a wildcard.
--     (Measured with the table: unescaped `w_ats` matched 38 names, escaped 0.)
--   * Dynamic SQL, but only fixed text is concatenated. Every value (type,
--     category, pattern, cursor, limit) is passed as a parameter, never spliced
--     into the statement, so nothing a visitor types can change the query's
--     shape. The statement text varies only by which of a few fixed fragments
--     apply, which is what lets the planner pick an index for each shape: a
--     single static query with `($1 is null or ...)` conditions would not.
--
-- Limit: the caller's limit is clamped to 1..101 (a page of up to 100 plus one
-- row to learn whether another page exists).
--
-- Errors are raised (SQLSTATE 22023, invalid_parameter_value) rather than
-- answered with an empty page, so a caller bug cannot look like "no apps": an
-- unknown order, a category without an app_type, or half a cursor (a value
-- without a slug or the reverse). A blank needle is not an error: it matches
-- nothing, and returns no rows.
--
-- Privileges: Supabase exposes every function in `public` over /rpc to `anon`
-- by default, so execute is revoked from public, anon and authenticated and
-- granted to service_role only, as 5.k.vii.zi and check_rate_limit do.
-- `security invoker` (the default, stated), so the table's own privileges and
-- RLS still apply to whoever calls it.
--
-- Safe to re-run: `create or replace`, and the revoke/grant are idempotent.

create or replace function public.catalog_page(
  p_order       text,
  p_app_type    text    default null,
  p_category    text    default null,
  p_needle      text    default null,
  p_after_value text    default null,
  p_after_slug  text    default null,
  p_limit       integer default 24
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

  -- $1 app_type, $2 category, $3 pattern, $4 cursor value, $5 cursor slug, $6 limit
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
    using p_app_type, p_category, v_pattern, p_after_value, p_after_slug, v_limit;
end;
$$;

comment on function public.catalog_page(text, text, text, text, text, text, integer) is
  '5.l.i.zo. One page of published catalog_app rows (no raw), in top or new order, optionally one app_type/category and/or a substring search over name or summary, after an optional (sort value, slug) cursor. service_role only.';

revoke all on function public.catalog_page(text, text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.catalog_page(text, text, text, text, text, text, integer)
  to service_role;
