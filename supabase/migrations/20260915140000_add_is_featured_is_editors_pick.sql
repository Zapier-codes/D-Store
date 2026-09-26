-- 1.a.i.zo — is_featured / is_editors_pick flags on the app catalog table.
--
-- Redone as a Supabase SQL migration per the architecture pivot (see
-- HANDOVER.md's "Architecture pivot" note): Phase 1.a data-model work is
-- now expressed directly against Postgres/Supabase, not the legacy
-- Doctrine `Application` entity. This leaf originally landed as a
-- Doctrine/YAML edit against legacy-symfony/.../Application.php +
-- Application.orm.yml; that edit was dropped and redone here to match.
--
-- Assumes an `application` table already exists in the target project,
-- mirroring the Doctrine entity's table name 1:1 (`table: application`
-- in Application.orm.yml) -- this migration only adds columns to it.
-- No foundational "create the application table" migration exists yet
-- in this repo (that's closer to 5.f.i.zo's scope); if the project this
-- gets pushed against doesn't have the base table, create that first.
--
-- "The target project" is D-Store's own, dedicated Supabase project --
-- never Zealot's. Zealot (github.com/Zapier-codes/zealot) already runs
-- its own separate Supabase-hosted Postgres for its own console schema
-- (see HANDOVER.md's "Cross-checked -- D-Store's Supabase is not, and
-- must never be, Zealot's Supabase" note); this repo reads Zealot's
-- catalog data via its signed index, never via a shared database.

alter table public.application
  add column is_featured boolean not null default false,
  add column is_editors_pick boolean not null default false;
