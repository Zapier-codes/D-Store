-- 1.a.ii.zi — sha256_checksum field on the app catalog table.
--
-- Same redo-as-SQL treatment as 1.a.i.zo (see that migration's header
-- and HANDOVER.md's "Architecture pivot" note) -- originally a
-- Doctrine/YAML edit, dropped and redone here.
--
-- Nullable, not defaulted: a checksum has no sensible zero-value to
-- backfill existing rows with, same reasoning the Doctrine schema used
-- `nullable: true` for on equivalent string columns (icon, license,
-- source, ...) rather than a `default:`.

alter table public.application
  add column sha256_checksum text;
