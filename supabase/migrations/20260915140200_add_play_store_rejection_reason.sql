-- 1.a.ii.zo — play_store_rejection_reason field on the app catalog table.
--
-- Converted from Doctrine to Supabase SQL per the resolved (a) decision in
-- HANDOVER.md's "Resolved — (a), retroactively convert all five merged
-- Doctrine leaves to Supabase SQL" note: this leaf originally landed as a
-- Doctrine/YAML edit against legacy-symfony/.../Application.php +
-- Application.orm.yml (nullable string, no default, appended directly
-- after sha256_checksum) -- that edit is superseded by this migration.
--
-- Same reasoning as 1.a.ii.zi's sha256_checksum column: nullable, not
-- defaulted, since a rejection reason has no sensible zero-value to
-- backfill existing rows with.
--
-- Depends on the `application` table this batch's other two migrations
-- (20260915140000, 20260915140100) already assume exists.

alter table public.application
  add column play_store_rejection_reason text;
