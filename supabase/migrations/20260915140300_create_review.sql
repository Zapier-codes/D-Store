-- 1.a.iii.zi — Review table (anonymous, rate-limited).
--
-- Converted from Doctrine to Supabase SQL per the resolved (a) decision in
-- HANDOVER.md's "Resolved — (a), retroactively convert all five merged
-- Doctrine leaves to Supabase SQL" note. Unlike 1.a.i.zo/1.a.ii.zi/zo
-- (columns added to an existing table), this leaf's original Doctrine
-- version was a *new entity* — Entity/Review.php, Entity/ReviewRepository.php,
-- Resources/config/doctrine/Review.orm.yml — so this is a `create table`,
-- not an `alter table`.
--
-- Fields mirror the Doctrine mapping 1:1:
--   id          string PK, same convention as `application.id`
--   rating      integer, required
--   comment     text, nullable — reviews may be rating-only
--   ip_hash     text, nullable — a hash only, never a raw IP; anonymous
--               by design (no author/user reference at all)
--   created_at  timestamp
-- plus the manyToOne relation to `application` (application_id -> id).
--
-- `ip_hash`/`application_id`/`created_at` together are exactly what
-- Doctrine's `ReviewRepository::countByIpHashSince($ipHash, $applicationId,
-- $since)` finder needs for its rate-limit check ("has this source already
-- submitted N reviews for this app in the last X?") — that query itself,
-- and the N/X limit and controller-level rejection, are still a later leaf
-- once an API layer exists; this migration only shapes the schema and adds
-- the index that query needs, same scope the original Doctrine leaf had.
--
-- Depends on the `application` table (see 1.a.i.zo's migration header —
-- not yet created by a migration in this repo, closer to 5.f.i.zo's scope).

create table public.review (
  id text primary key,
  application_id text not null references public.application(id),
  rating integer not null,
  comment text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index review_ip_hash_application_created_idx
  on public.review (ip_hash, application_id, created_at);
