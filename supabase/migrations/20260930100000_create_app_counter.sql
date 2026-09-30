-- 5.g.v.zo (part 1 of 3) — install/view counters, store-owned, keyed by slug.
--
-- Why a new table and not columns on `application`: the catalog is read from
-- Zealot's signed index and Aptoide, not from Supabase (HANDOVER.md, "Resolved
-- — catalog contract"), so `public.application` is not where an app's slug is
-- guaranteed to exist. Counters are data this store itself generates, so they
-- key on the slug the storefront already uses in its URLs, with no foreign key.
-- A slug that is later removed from the catalog simply keeps its history.
--
-- Backs the two increment routes that today write to the in-memory `apps`
-- array (`incrementInstallCount` / `incrementViewCount` in lib/catalog.ts):
-- once those are pointed at Supabase they call the two functions below.
--
-- Increment is one atomic upsert per call (no read-then-write), so two
-- serverless instances cannot lose an update. Throttling is NOT here — that is
-- 5.d.ii.zi / 5.k.vi.zo.
--
-- Privileges: RLS on with no policies, so anon/authenticated see nothing even
-- if a grant is ever widened. The functions are revoked from anon and
-- authenticated and granted to service_role only (server-side code).
-- Must run on Supabase, or on Postgres that has anon/authenticated/service_role.

create table public.app_counter (
  app_slug text primary key,
  install_count bigint not null default 0 check (install_count >= 0),
  view_count bigint not null default 0 check (view_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.app_counter enable row level security;

create or replace function public.increment_app_install(p_slug text)
returns bigint
language sql
volatile
security invoker
set search_path = public
as $$
  insert into app_counter as c (app_slug, install_count)
  values (p_slug, 1)
  on conflict (app_slug)
  do update set install_count = c.install_count + 1, updated_at = now()
  returning c.install_count;
$$;

create or replace function public.increment_app_view(p_slug text)
returns bigint
language sql
volatile
security invoker
set search_path = public
as $$
  insert into app_counter as c (app_slug, view_count)
  values (p_slug, 1)
  on conflict (app_slug)
  do update set view_count = c.view_count + 1, updated_at = now()
  returning c.view_count;
$$;

revoke all on function public.increment_app_install(text) from public, anon, authenticated;
revoke all on function public.increment_app_view(text) from public, anon, authenticated;
grant execute on function public.increment_app_install(text) to service_role;
grant execute on function public.increment_app_view(text) to service_role;
