-- 1.a.iii.zo — ReportFlag table (anonymous app reports).
--
-- Converted from Doctrine to Supabase SQL per the resolved (a) decision in
-- HANDOVER.md's "Resolved — (a), retroactively convert all five merged
-- Doctrine leaves to Supabase SQL" note. Same shape as 1.a.iii.zi's Review
-- conversion: the original Doctrine version was a *new entity* —
-- Entity/ReportFlag.php, Entity/ReportFlagRepository.php,
-- Resources/config/doctrine/ReportFlag.orm.yml — so this is a
-- `create table`, not an `alter table`.
--
-- Fields mirror the Doctrine mapping 1:1:
--   id          text PK, same convention as `application.id`/`review.id`
--   reason      text, required — one of the dummy ReportAppForm.tsx
--               (0.f.iii.zi) fixed categories (Broken download link /
--               Malware or security concern / Inappropriate content /
--               Copyright-DMCA issue / Other); not a schema-level enum
--               here, same as the Doctrine mapping left it a plain string
--   details     text, nullable — mirrors that form's optional free-text
--               field
--   status      text, default 'open' — doesn't come from the dummy form;
--               exists for the future admin review queue (2.b.iii.zo) to
--               filter on
--   created_at  timestamp
-- plus the manyToOne relation to `application` (application_id -> id).
--
-- Deliberately no `ip_hash`/rate-limit column, unlike `review`: per
-- docs/D-STORE.md §7, only `Review` is "rate-limited", not `ReportFlag`,
-- so that field would be speculative rather than spec-driven — same
-- reasoning the original Doctrine entity's header comment gave.
--
-- The `(status, created_at)` index exists for the same reason `review`'s
-- index does: it's exactly what the Doctrine ReportFlagRepository's
-- `findByStatus($status)` finder queried on (`status = :status`, ordered
-- by `created_at DESC`) — the query the future admin review queue
-- (2.b.iii.zo) needs to list open reports newest-first. That queue's own
-- leaf already exists against the Doctrine entities on origin/master
-- (built before this conversion); confirming it has no hard Doctrine
-- dependency (relations, repository methods) before those PHP files are
-- safe to drop is the next, separate leaf per the resolved decision.
--
-- Depends on the `application` table (see 1.a.i.zo's migration header —
-- not yet created by a migration in this repo, closer to 5.f.i.zo's scope).

create table public.report_flag (
  id text primary key,
  application_id text not null references public.application(id),
  reason text not null,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index report_flag_status_created_idx
  on public.report_flag (status, created_at desc);
