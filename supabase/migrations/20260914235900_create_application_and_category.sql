-- 5.f.i.zo — Migrate the base `Application`/`Category` schema from the
-- legacy Symfony/Doctrine entities into Supabase, as committed migration
-- files, per the "migrations and edge functions live in-repo" requirement
-- at the top of this section (5.f).
--
-- Every later `1.a` migration in this directory (20260915140000 onward)
-- already assumes `public.application` exists and only ALTERs it — each
-- of their own headers says so explicitly ("no foundational 'create the
-- application table' migration exists yet in this repo, that's closer to
-- 5.f.i.zo's scope"). This migration is that foundation, so it is
-- timestamped *before* all five of them (20260914235900 <
-- 20260915140000) so a full `supabase db push` replay creates the base
-- tables first and the ALTERs apply cleanly afterwards, in filename order.
--
-- Fields mirror the two Doctrine mappings 1:1, MINUS the four columns
-- that already have their own dedicated migration in this directory
-- (adding them again here would conflict with those ALTERs):
--   - is_featured / is_editors_pick   -> 20260915140000
--   - sha256_checksum                 -> 20260915140100
--   - play_store_rejection_reason     -> 20260915140200
--
-- `category` is created first: `application.category_slug` is a
-- `manyToOne` to `Category.slug` in the Doctrine mapping
-- (Application.orm.yml's `manyToOne.category.joinColumn`), so the
-- referenced table must exist before the referencing FK column does —
-- same dependency-ordering reasoning `review`/`report_flag` already used
-- for their own FK to `application(id)`.
--
-- Doctrine -> Postgres type mapping notes:
--   - Doctrine's `id: { type: string, id: true }` on both entities ->
--     `text primary key`, same convention `review`/`report_flag` already
--     used for `application_id`.
--   - Doctrine's `type: date` (created_at/updated_at) -> `timestamptz`,
--     matching the `timestamptz` convention already used for
--     `review.created_at`/`report_flag.created_at`, rather than a bare
--     `date` (which would drop the time component the Doctrine app's
--     "since" queries assume) — `type: date` here is Doctrine's mapping
--     type, not a design intent to discard time-of-day.
--   - Doctrine's `type: float` (avg_rating) -> `double precision`.
--   - Doctrine's `unique: true` (Category.name, Application.slug) ->
--     `unique` column constraints, not separate indexes, matching
--     Doctrine's own single-column-uniqueness mapping.
--   - Every Doctrine field left `nullable: true` (site, source, tracker,
--     donate, icon, primary_color, secondary_color, tertiary_color,
--     license, count) stays nullable here, no invented default — same
--     "no sensible zero-value to backfill" reasoning the later
--     `sha256_checksum`/`play_store_rejection_reason` migrations already
--     used for their own nullable text columns.
--   - `install_count` / `avg_rating` / `rating_count` keep Doctrine's
--     `options: default: 0` — these are real Doctrine defaults, not a
--     Supabase-side invention.

create table public.category (
  slug text primary key,
  name text not null unique,
  icon text not null,
  is_published boolean not null,
  count integer
);

create table public.application (
  id text primary key,
  slug text not null unique,
  name text not null,
  summary text not null,
  description text not null,
  site text,
  source text,
  tracker text,
  donate text,
  icon text,
  primary_color text,
  secondary_color text,
  tertiary_color text,
  apk text not null,
  version text not null,
  license text,
  is_published boolean not null,
  install_count integer not null default 0,
  avg_rating double precision not null default 0,
  rating_count integer not null default 0,
  category_slug text references public.category(slug),
  created_at timestamptz not null,
  updated_at timestamptz not null
);
