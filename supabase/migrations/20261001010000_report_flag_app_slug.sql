-- 3.c.v.zi — report_flag keyed by the catalog slug, not by a row in `application`.
--
-- Why. `report_flag.application_id` is `not null` and a foreign key to
-- `public.application(id)`. Nothing in this repo ever inserts into
-- `application`: the live catalog is Zealot's signed index plus the Aptoide
-- snapshot, and the counters migration (20260930100000) already keys by slug
-- for that reason. So a report for a real catalog app has no row to point at,
-- and the intake route (`app/api/apps/[slug]/reports/route.ts`, leaf
-- 3.c.iii.zi part 1) answers 404 for every one of them. See the split note
-- under 3.c.iii.zi part 2 in HANDOVER.md, finding (a).
--
-- What this does, and only this:
--   1. adds `app_slug text`, nullable — the catalog slug the report is about;
--   2. drops `not null` from `application_id`, but KEEPS the column and its
--      foreign key, so existing rows, the legacy Symfony queue and
--      `store_stats()` (which reads `status` and `reason` only) keep working;
--   3. adds a check that at least one of the two identifies the app, and that
--      a slug, when it is the only identifier, is not an empty string;
--   4. adds an index on (app_slug, status) for "open reports for this app".
--
-- What this does NOT do:
--   - it does not touch the intake route (that is 3.c.v.zo);
--   - it does not validate the slug's shape or that it exists in the catalog:
--     the catalog is not in this database, so the route checks it (3.c.v.zo);
--   - it adds no policy and no grant, and revokes nothing. RLS was enabled on
--     this table by 20260930100300 and stays on with no policy, so anon and
--     authenticated still see no rows; service_role bypasses it as before. A
--     new column is covered by the table's existing RLS and grants;
--   - it does not backfill `app_slug` for old rows: they have an
--     `application_id`, which satisfies the check.
--
-- Not changed on purpose: `review` has the same `application_id not null`
-- foreign key and the same problem. It is not part of this leaf (reviews are
-- not reported through this route and have no queue); flagged in HANDOVER.md.
--
-- Safe to re-run: `add column if not exists`, `drop not null` and
-- `create index if not exists` are idempotent, and the constraint is dropped
-- before it is added. Depends on 20260915140400 (report_flag).

alter table public.report_flag
  add column if not exists app_slug text;

alter table public.report_flag
  alter column application_id drop not null;

alter table public.report_flag
  drop constraint if exists report_flag_app_identified_chk;

alter table public.report_flag
  add constraint report_flag_app_identified_chk
  check (application_id is not null or (app_slug is not null and app_slug <> ''));

create index if not exists report_flag_app_slug_status_idx
  on public.report_flag (app_slug, status);
