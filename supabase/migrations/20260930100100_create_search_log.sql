-- 5.g.v.zo (part 2 of 3) — search log behind the "top searches" figure.
--
-- Replaces the in-memory `searchLog` array (`logSearchQuery` in lib/catalog.ts,
-- read back by `getTopSearches`). One row per search, storing only the
-- normalized query text (trimmed, lower-cased by the caller — the same
-- case-fold `getTopSearches` applies today) and a timestamp. No IP, no
-- device id, no account: the store is account-free by design (docs/D-STORE.md
-- section 3), and a search string is the only thing the dashboard needs.
--
-- The length check bounds what a hostile caller can store per row; the caller
-- should also truncate before insert. Retention (deleting old rows) is not
-- decided here — see HANDOVER.md, 5.g.v.zo's Done note.
--
-- The index on (query_norm) serves the GROUP BY in store_stats(); the index on
-- created_at serves a future retention job.
--
-- Same privilege posture as app_counter: RLS on, no policies. Inserts come from
-- server code holding the service-role key.

create table public.search_log (
  id bigint generated always as identity primary key,
  query_norm text not null check (char_length(query_norm) between 1 and 200),
  created_at timestamptz not null default now()
);

create index search_log_query_idx on public.search_log (query_norm);
create index search_log_created_idx on public.search_log (created_at);

alter table public.search_log enable row level security;
