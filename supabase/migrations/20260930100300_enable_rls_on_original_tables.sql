-- 5.g.v.zo (hardening, added with the stats migrations) — turn row-level
-- security on for the four tables the earliest migrations created without it.
--
-- Why: Supabase grants ALL on every new table in `public` to anon and
-- authenticated by default, and serves them through PostgREST with the public
-- anon key. `application`, `category`, `review` and `report_flag` were created
-- before this was considered, with RLS off, so on a live project anyone holding
-- the anon key could read, insert into and delete from them — including
-- deleting reviews and report flags. Verified in a real Postgres set up with
-- Supabase's default grants: as `anon`, `select` returned every row, `insert`
-- into report_flag succeeded and `delete from review` removed a row.
--
-- What this does: RLS on, NO policies. That denies anon and authenticated every
-- row. `service_role` bypasses RLS (Supabase gives it BYPASSRLS), so all
-- server-side code, and `store_stats()`, keep working. It matches how
-- app_counter, search_log and the push tables are already set up.
--
-- What it does not do: it changes no column, no data and no function, and
-- nothing in the app reads these tables through the anon key today (the app
-- has no live Supabase client). To undo: `alter table ... disable row level
-- security` for each table, or delete this file before the first push.

alter table public.application enable row level security;
alter table public.category enable row level security;
alter table public.review enable row level security;
alter table public.report_flag enable row level security;
