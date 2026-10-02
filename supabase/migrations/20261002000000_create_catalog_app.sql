-- 5.l.i.zi — the `catalog_app` table: the third-party (Aptoide) catalog, moved
-- out of snapshot files and into Postgres.
--
-- Why: the snapshot is about 7.6 KB an app, so 10,000 apps is roughly 76 MB in
-- about ten files read from disk by every serverless instance. The table lets a
-- page read one page of rows instead of the whole catalog. This leaf is only
-- the table and its indexes; nothing reads or writes it yet:
--   5.l.i.zo    the paged read and search functions over it
--   5.l.ii.zi   the reader behind lib/catalog.ts
--   5.l.ii.zo   the one-time load of the 1,506 snapshot apps
--   5.l.iii.zi  the ingest job writing here directly
--
-- What a row is. One Aptoide app, in two parts:
--   * flat columns for everything a page filters, sorts or searches on, so the
--     indexes below can serve those reads without opening the payload;
--   * `raw`, the source payload exactly as the ingest fetched it (an
--     AptoideRawApp, including `versions` when the fetcher attached them).
-- `raw` is stored, not the normalized `App`, on purpose: normalizeAptoideApp
-- (lib/sources/aptoide.ts) is code, and code gets fixed. The null-developer
-- outage (475f63c) was repaired in the normalizer and every stored snapshot
-- entry benefited at once. Had a normalized copy been stored, the bad value
-- would have been stored with it. The detail page reads `raw` for one slug and
-- normalizes it; list pages never select it (it is TOASTed, so a query that
-- does not name it does not read it).
--
-- The cost of that choice, stated plainly: the flat columns are derived at
-- write time (by calling normalizeAptoideApp, so they cannot disagree with the
-- detail page). If the normalizer's mapping changes later (a package moves
-- category, say) the columns are stale until the rows are re-derived from `raw`.
-- That is a re-run of the loader, not a re-crawl.
--
-- What is NOT in this table, and where it lives instead:
--   * Zealot (first-party) apps. Their source of truth is Zealot's signed index,
--     read by lib/sources/zealot.ts, and the reader merges them in front of
--     whatever this table returns (first-party ranks first, 5.h.i.zo). The
--     `origin` column still allows 'zealot' so the shape does not have to change
--     if that is ever revisited; nothing writes it today.
--   * This store's own counters (installs, views): `app_counter`, keyed by slug.
--     Aptoide-origin rows always carry 0 for both, so they are not duplicated.
--   * Reviews and reports: `review` and `report_flag`, keyed by slug. No foreign
--     key to this table: they must keep working for first-party slugs, which are
--     not rows here.
--
-- Identity and de-duplication.
--   id            'aptoide-<Aptoide id>', the same value App.id carries.
--   slug          unique. mergeCatalogSources lets two apps with different
--                 packages share a slug and keeps the first one found; a unique
--                 constraint turns that into "the second insert is refused",
--                 and the writer decides (on conflict do nothing, and count it).
--   package_name  unique: the catalog dedupes on package, first source wins, and
--                 one row per package is how that rule looks in a table.
-- Both unique constraints are what `on conflict` in the loader and the ingest
-- will target.
--
-- Constraints are limited to things whose violation is a bug, not data that
-- merely looks odd: a slug becomes a URL path segment, so it may not hold a
-- slash, space or other separator (it must start with a letter or digit and
-- continue with letters, digits, '.', '_' or '-'; checked against all 1,506
-- snapshot slugs, 0 violations); download_url is empty or https:// (the same
-- rule as aptoideDownloadUrl, so a stored row cannot make a dead or
-- javascript: link); counts and sizes are not negative. The writer must
-- validate against the same slug pattern and COUNT what it skips: one row that
-- violates a check fails the whole statement it is in.
--
-- Columns that need a rule for the writer (the table cannot enforce them):
--   source_created_at / source_updated_at  Aptoide sends 'YYYY-MM-DD HH:MM:SS'
--                 with no zone. Postgres would read that in the session time
--                 zone. The writer must send an explicit UTC ISO string
--                 (Aptoide's times are treated as UTC, as normalizeAptoideApp
--                 already does by passing them through), or the same row loaded
--                 from two machines could differ by hours.
--   reported_downloads  Aptoide's own reported figure (stats.downloads), kept
--                 only so charts can order by it. NULL means "not reported",
--                 which is different from 0 and sorts last (see below). It is a
--                 reported bucket, never a count this store measured.
--   category      a Play slug from toPlay(), or 'uncategorized'. Only
--                 unambiguous together with app_type ('sports' is in both).
--
-- Indexes. They match the orderings the code uses today (getTopFreeApps: by
-- reported downloads, ties by slug; getNewAndUpdated: by updated time), made
-- deterministic for paging by ending in `slug` (unique), so a keyset cursor of
-- (sort value, slug) never skips or repeats a row.
--   * Downloads is indexed as coalesce(reported_downloads, -1): that is exactly
--     the code's `?? -1`, and it makes the cursor a plain comparison instead of
--     a three-way NULL case. 5.l.i.zo's functions MUST write the same expression
--     or the planner cannot use these indexes.
--   * Descending sort value, ascending slug. A single row-value comparison
--     cannot express mixed directions, so a cursor is two ranges: rows with
--     `v = $v and slug > $slug`, and rows with `v < $v`. Measured at 10,000
--     rows (scratch data, not committed): written as one `or`, the page cost
--     grew with depth (0.1 ms at the start, 4.3 ms at row 9,000, because the
--     planner scans a long index range and discards rows); written as the two
--     ranges `union all`ed, each with its own `limit`, it stayed flat at about
--     0.15 ms at every depth. A walk of all 9,913 published rows in pages of 24
--     and of 1,000, in both orderings, returned exactly the full ORDER BY
--     sequence with no repeats, with only 28 distinct download values and 566
--     NULLs to make ties. 5.l.i.zo should use the two-range form.
--   * No partial indexes on is_published: unpublished rows are rare (a
--     take-down), so the filter is cheap and a partial predicate would be one
--     more thing the reads must match exactly.
--   * Search: the current rule is a case-insensitive substring match over name
--     OR summary (searchApps). Two trigram GIN indexes keep exactly that rule
--     (`ilike '%needle%'`), served by pg_trgm for needles of 3+ characters; a
--     shorter needle falls back to a scan, which at 10,000 rows is small. 5.l.i.zo
--     must escape '%', '_' and '\' in the needle, or a user's `_` becomes a
--     wildcard. The extension is created in the `extensions` schema, as Supabase
--     does, and the search_path below lets this file find its operator class
--     whether the extension was already installed in `public` or `extensions`.
--   * Not indexed, deliberately: A-Z order, license, size, region. Nothing
--     pages by them yet; with a category chosen the remaining rows are few. Each
--     is one small migration when a page needs it.
--
-- Privileges: the same posture as app_counter, rate_limit and the push tables.
-- RLS on with NO policies, and everything revoked from anon/authenticated, so
-- the public anon key cannot read or write the catalog directly. Only
-- service_role (server-side code; its key never reaches a browser) can. The
-- 10,000-row catalog is public information, but a writable table behind the
-- anon key is not, and every read goes through server code anyway.
--
-- Safe to re-run: every statement is idempotent. Run on Supabase, or on Postgres
-- that has the anon/authenticated/service_role roles.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- So `gin_trgm_ops` resolves wherever pg_trgm lives. Reset at the end of the file.
set search_path = public, extensions;

create table if not exists public.catalog_app (
  id                 text        not null,
  slug               text        not null,
  package_name       text        not null,
  origin             text        not null default 'aptoide',
  name               text        not null,
  summary            text        not null default '',
  icon               text        not null default '',
  version            text        not null,
  app_type           text        not null default 'app',
  category           text        not null,
  developer_slug     text        not null,
  developer_name     text        not null,
  license            text        not null default 'Not provided',
  size_mb            numeric(9,1) not null default 0,
  download_url       text        not null default '',
  reported_downloads bigint,
  is_published       boolean     not null default true,
  source_created_at  timestamptz not null,
  source_updated_at  timestamptz not null,
  ingested_at        timestamptz not null default now(),
  raw                jsonb       not null,

  constraint catalog_app_pkey primary key (id),
  constraint catalog_app_slug_key unique (slug),
  constraint catalog_app_package_name_key unique (package_name),

  constraint catalog_app_id_nonblank check (btrim(id) <> ''),
  constraint catalog_app_slug_format check (slug ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  constraint catalog_app_package_nonblank check (btrim(package_name) <> ''),
  constraint catalog_app_origin_known check (origin in ('zealot', 'aptoide')),
  constraint catalog_app_name_nonblank check (btrim(name) <> ''),
  constraint catalog_app_version_nonblank check (btrim(version) <> ''),
  constraint catalog_app_app_type_known check (app_type in ('app', 'game')),
  constraint catalog_app_category_nonblank check (btrim(category) <> ''),
  constraint catalog_app_developer_slug_nonblank check (btrim(developer_slug) <> ''),
  constraint catalog_app_developer_name_nonblank check (btrim(developer_name) <> ''),
  constraint catalog_app_size_nonnegative check (size_mb >= 0),
  constraint catalog_app_download_url_https check (download_url = '' or download_url like 'https://%'),
  constraint catalog_app_downloads_nonnegative check (reported_downloads is null or reported_downloads >= 0),
  constraint catalog_app_raw_is_object check (jsonb_typeof(raw) = 'object')
);

comment on table public.catalog_app is
  '5.l.i.zi. Third-party (Aptoide) catalog. Flat columns for filtering, sorting and search; raw holds the source payload that normalizeAptoideApp turns into an App. Zealot apps are not rows here.';
comment on column public.catalog_app.raw is
  'The source payload as fetched (AptoideRawApp). Never selected by list reads. Flat columns are derived from it at write time.';
comment on column public.catalog_app.reported_downloads is
  'Aptoide''s own reported download figure (stats.downloads). NULL = not reported, which orders after 0. Not a count this store measured.';
comment on column public.catalog_app.source_updated_at is
  'Aptoide''s `modified`, as UTC. The writer must send an explicit-zone value; a bare timestamp is read in the session time zone.';

-- Chart / "All apps" / Top Free order: reported downloads descending (NULL as -1), slug ascending.
create index if not exists catalog_app_top_idx
  on public.catalog_app ((coalesce(reported_downloads, -1)) desc, slug asc);

-- "New & Updated" order: source update time descending, slug ascending.
create index if not exists catalog_app_new_idx
  on public.catalog_app (source_updated_at desc, slug asc);

-- The same two orders inside one category (app_type first: category slugs are only unambiguous with it).
create index if not exists catalog_app_category_top_idx
  on public.catalog_app (app_type, category, (coalesce(reported_downloads, -1)) desc, slug asc);

create index if not exists catalog_app_category_new_idx
  on public.catalog_app (app_type, category, source_updated_at desc, slug asc);

-- "More from this developer" (getAppsByDeveloper).
create index if not exists catalog_app_developer_idx
  on public.catalog_app (developer_slug, slug);

-- Substring search over name OR summary, case-insensitive (`ilike '%needle%'`).
create index if not exists catalog_app_name_trgm_idx
  on public.catalog_app using gin (name gin_trgm_ops);

create index if not exists catalog_app_summary_trgm_idx
  on public.catalog_app using gin (summary gin_trgm_ops);

alter table public.catalog_app enable row level security;
revoke all on public.catalog_app from anon, authenticated;
grant all on public.catalog_app to service_role;

reset search_path;
