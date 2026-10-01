#!/usr/bin/env bash
# Restores a decrypted database backup (roles.sql, schema.sql, data.sql from backup.sh db) into
# an empty Supabase database. See docs/OPERATIONS.md.
#
#   RESTORE_DB_URL=<db-url> restore.sh <backup-dir>
#
# Without $RESTORE_DB_URL it asks for the URL without echoing it. The URL is never an argument,
# here or to psql, so its password stays out of shell history and the process list: psql gets the
# URL without it, and the password through $PGPASSWORD.
set -euo pipefail
set +x

# shellcheck source=scripts/backup/secrets.sh
source "$(dirname "${BASH_SOURCE[0]}")/secrets.sh"

[ "$#" -eq 1 ] || {
  echo "usage: RESTORE_DB_URL=<db-url> restore.sh <backup-dir> (the URL is no longer an argument)" >&2
  exit 1
}
dir="$1"
for file in roles schema data; do
  [ -s "$dir/$file.sql" ] || {
    echo "$dir/$file.sql is missing or empty." >&2
    exit 1
  }
done

db_url="${RESTORE_DB_URL:-}"
if [ -z "$db_url" ]; then
  [ -t 0 ] || {
    echo "Set RESTORE_DB_URL, or run this in a terminal to be asked for the URL." >&2
    exit 1
  }
  read -rsp "Database URL to restore into (not shown): " db_url
  echo >&2
fi
[ -n "$db_url" ] || {
  echo "No database URL given." >&2
  exit 1
}

conn="$db_url"
password=""
if split_db_url "$db_url"; then
  conn="$DB_URL_HEAD$DB_URL_TAIL"
  password="$(percent_decode "$DB_URL_PASSWORD")"
fi

# psql's messages, with the URL and its password blanked. Its exit status is kept.
quietly_psql() {
  if [ -n "$password" ]; then export PGPASSWORD="$password"; fi
  psql --dbname "$conn" "$@" 2>&1 | SUPABASE_DB_URL="$db_url" redact >&2
}

# The roles file also grants platform settings the postgres role may not re-grant, and those
# already exist in any Supabase project, so an error here is reported but doesn't stop the restore.
quietly_psql --quiet --file "$dir/roles.sql" || echo "Some role statements failed; see above." >&2

# Schema and data in one transaction, so a failure leaves the database as it was. Triggers are off
# while the rows load, as they were written. The data dump has a COPY for every table, empty or
# not, and Supabase's newer platform tables (storage.buckets_vectors and the like) refuse even an
# empty COPY from postgres, so the empty ones are dropped first; that loses no rows.
awk '
  pending != "" { if ($0 != "\\.") print pending ORS $0; pending = ""; next }
  /^COPY .* FROM stdin;$/ { pending = $0; next }
  { print }
' "$dir/data.sql" >"$dir/data.nonempty.sql"

quietly_psql --quiet --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$dir/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$dir/data.nonempty.sql"
echo "Restored $dir into the database." >&2
