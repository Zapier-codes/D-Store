#!/usr/bin/env bash
# Apply every supabase/migrations/*.sql, in filename order, over a plain
# Postgres connection — for running from Ubuntu on Termux (proot-distro) with
# only `psql` installed (apt-get install postgresql-client). No Docker, no
# Supabase CLI needed.
#
#   export DATABASE_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres?sslmode=require'
#   bash scripts/apply-migrations.sh            # apply what is missing
#   bash scripts/apply-migrations.sh --dry-run  # list what WOULD be applied
#
# Which connection string: Supabase dashboard > Connect > "Session pooler".
# Use that one, not the "Direct connection": the direct host is IPv6-only on
# many plans and mobile networks / Termux often have no IPv6, so it fails to
# connect. (Zealot's own database is on the session pooler for the same
# reason.) Use the D-Store project's string — never Zealot's
# (HANDOVER.md, "Cross-checked — D-Store's Supabase is not, and must never be,
# Zealot's Supabase").
#
# Safe to re-run: each applied file is recorded in
# supabase_migrations.schema_migrations (version = the 14-digit filename
# prefix), modelled on the table the Supabase CLI keeps; this script has NOT
# been tested against the CLI, so do not mix the two on one project without
# checking that table first. Each file runs in its own transaction and the
# script stops at the first failure, leaving earlier files applied.
set -euo pipefail

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1
: "${DATABASE_URL:?Set DATABASE_URL to the D-Store Supabase session-pooler connection string}"
command -v psql >/dev/null || { echo "psql not found: apt-get install postgresql-client" >&2; exit 1; }

DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"
[ -d "$DIR" ] || { echo "no migrations directory at $DIR" >&2; exit 1; }
PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -c "create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key, statements text[], name text);"

applied=0; skipped=0
for f in $(ls "$DIR"/*.sql | sort); do
  base="$(basename "$f" .sql)"
  version="${base%%_*}"
  name="${base#*_}"
  case "$version" in ''|*[!0-9]*) echo "skip (bad name): $base" >&2; continue;; esac
  seen="$("${PSQL[@]}" -tA -c "select 1 from supabase_migrations.schema_migrations where version = '$version'")"
  if [ -n "$seen" ]; then skipped=$((skipped+1)); continue; fi
  if [ "$DRY" = 1 ]; then echo "would apply: $base"; applied=$((applied+1)); continue; fi
  echo "applying:    $base"
  { echo "begin;"; cat "$f"; echo; echo "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name');"; echo "commit;"; } \
    | "${PSQL[@]}" -f -
  applied=$((applied+1))
done
echo "done: $applied applied, $skipped already applied$([ "$DRY" = 1 ] && echo ' (dry run, nothing changed)')"
