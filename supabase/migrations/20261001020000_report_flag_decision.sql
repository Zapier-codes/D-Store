-- 3.c.vii.zi — the decision record on report_flag.
--
-- Why. `docs/MODERATION.md` section 5 steps 3 and 5 say a moderator decides
-- (no action, relabel, remove, escalate) and the decision is recorded. The
-- table has only `status`, `reason`, `details` and `created_at`, so there is
-- nowhere to put either the decision or when it was made. The report queue
-- (leaves 3.c.vii.zo to 3.c.ix.zo in HANDOVER.md, "Split of part 3" under
-- 3.c.iii.zi) reads and writes these columns, so this migration comes first.
--
-- What this does, and only this:
--   1. adds `decision text`, nullable — null while a report is open;
--   2. adds `decided_at timestamptz`, nullable — when it was decided;
--   3. adds a check that `decision` is null or one of the four values from
--      section 5 step 3: no_action, relabel, remove, escalate.
--
-- What this does NOT do:
--   - no `not null`, no default and no backfill: every existing row (open, or
--     closed by the legacy Symfony queue) keeps `decision` and `decided_at`
--     null and still satisfies the check;
--   - no moderator-id column and no free-text note column. Section 5 step 5
--     says keep the decision, never a personal identifier; recording who
--     decided is a separate decision for the operator (it also needs
--     section 7 and /privacy updated) and would be its own migration;
--   - no check tying `status` to `decision`: the legacy queue used its own
--     status values, and a check on `status` could fail against existing
--     rows. The store (3.c.viii.zi) sets `status`, `decision` and
--     `decided_at` together in one update;
--   - no new index. The existing report_flag_status_created_idx on
--     (status, created_at desc) (20260915140400) already serves "open
--     reports, newest first", which is the queue's list query; a second index
--     on the same columns would only cost writes;
--   - no policy, grant or revoke. RLS was enabled on this table by
--     20260930100300 and stays on with no policy, so anon and authenticated
--     still see no rows; service_role bypasses it as before. New columns are
--     covered by the table's existing RLS and grants. `store_stats()` reads
--     `status` and `reason` only and is unaffected.
--
-- Safe to re-run: `add column if not exists`, and the constraint is dropped
-- before it is added. Depends on 20260915140400 (report_flag); it does not
-- depend on 20261001010000 (report_flag_app_slug) and can run before or after
-- it, though the migrations are applied in timestamp order.

alter table public.report_flag
  add column if not exists decision text;

alter table public.report_flag
  add column if not exists decided_at timestamptz;

alter table public.report_flag
  drop constraint if exists report_flag_decision_chk;

alter table public.report_flag
  add constraint report_flag_decision_chk
  check (decision is null or decision in ('no_action', 'relabel', 'remove', 'escalate'));
