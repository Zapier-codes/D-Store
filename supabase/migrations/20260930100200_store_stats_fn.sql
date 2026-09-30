-- 5.g.v.zo (part 3 of 3) — one read-only function that returns every figure
-- Zealot's admin needs, as one JSON document.
--
-- Backs the token-authenticated `GET` route that 5.g.v.zo adds in the app
-- (Zealot's Task 31b reads it). One function, one RPC call, one round trip:
-- the route does not stitch four queries together, and the answer is a
-- consistent snapshot (a single statement).
--
--   p_top   how many top searches / per-app rows to return. Clamped to 1..100
--           so a caller cannot ask for an unbounded result.
--
-- Shape of the result (all counts are JSON numbers):
--   generated_at
--   traffic  { total_installs, total_views, apps_tracked,
--              per_app: [ { slug, install_count, view_count } ] }   by views
--   searches { total, distinct_queries,
--              top: [ { query, count } ] }                          by count
--   reports  { total, by_status: { <status>: n }, by_reason: { <reason>: n } }
--   reviews  { total, average_rating,
--              per_app: [ { slug, count, average_rating } ] }       by count
--
-- Ties are broken by name in byte order (`collate "C"`) so the same data always
-- gives the same document, whatever the database's default locale.
--
-- What this deliberately does NOT return: no review text (`comment`), no
-- `ip_hash`, no report `details`, no individual search timestamps. Zealot is a
-- read-only consumer of aggregates (HANDOVER.md, "Resolved — catalog
-- contract"); free text and hashes stay in this database.
--
-- Review slugs: `review` keys on application_id. Where `application` has a row
-- for it the slug is used; otherwise the id itself is shown, so a review is
-- never dropped from the totals. See the HANDOVER.md note on the
-- review/report_flag foreign key to `application`.
--
-- Privileges: same posture as subscribed_slugs(): revoked from anon and
-- authenticated (Supabase exposes public functions as /rpc/<name> with the
-- public anon key), granted to service_role only. Depends on
-- 20260915140300 (review), 20260915140400 (report_flag),
-- 20260914235900 (application), 20260930100000 (app_counter),
-- 20260930100100 (search_log).

create or replace function public.store_stats(p_top integer default 20)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with lim as (
    select greatest(1, least(coalesce(p_top, 20), 100)) as n
  )
  select jsonb_build_object(
    'generated_at', now(),

    'traffic', jsonb_build_object(
      'total_installs', (select coalesce(sum(install_count), 0) from app_counter),
      'total_views',    (select coalesce(sum(view_count), 0) from app_counter),
      'apps_tracked',   (select count(*) from app_counter),
      'per_app', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'slug', t.app_slug,
                 'install_count', t.install_count,
                 'view_count', t.view_count)
               order by t.view_count desc, t.app_slug collate "C")
        from (select app_slug, install_count, view_count
              from app_counter
              order by view_count desc, app_slug collate "C"
              limit (select n from lim)) t
      ), '[]'::jsonb)
    ),

    'searches', jsonb_build_object(
      'total',            (select count(*) from search_log),
      'distinct_queries', (select count(distinct query_norm) from search_log),
      'top', coalesce((
        select jsonb_agg(jsonb_build_object('query', s.query_norm, 'count', s.c)
                         order by s.c desc, s.query_norm collate "C")
        from (select query_norm, count(*) as c
              from search_log
              group by query_norm
              order by c desc, query_norm collate "C"
              limit (select n from lim)) s
      ), '[]'::jsonb)
    ),

    'reports', jsonb_build_object(
      'total', (select count(*) from report_flag),
      'by_status', coalesce((
        select jsonb_object_agg(x.status, x.c)
        from (select status, count(*) as c from report_flag group by status) x
      ), '{}'::jsonb),
      'by_reason', coalesce((
        select jsonb_object_agg(x.reason, x.c)
        from (select reason, count(*) as c from report_flag group by reason) x
      ), '{}'::jsonb)
    ),

    'reviews', jsonb_build_object(
      'total',          (select count(*) from review),
      'average_rating', (select round(avg(rating)::numeric, 2) from review),
      'per_app', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'slug', r.slug,
                 'count', r.c,
                 'average_rating', r.avg_rating)
               order by r.c desc, r.slug collate "C")
        from (select coalesce(a.slug, v.application_id) as slug,
                     count(*) as c,
                     round(avg(v.rating)::numeric, 2) as avg_rating
              from review v
              left join application a on a.id = v.application_id
              group by coalesce(a.slug, v.application_id)
              order by c desc, coalesce(a.slug, v.application_id) collate "C"
              limit (select n from lim)) r
      ), '[]'::jsonb)
    )
  );
$$;

revoke all on function public.store_stats(integer) from public, anon, authenticated;
grant execute on function public.store_stats(integer) to service_role;
