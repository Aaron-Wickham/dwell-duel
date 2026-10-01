#!/usr/bin/env bash
# Restores a decrypted database backup (roles.sql, schema.sql, data.sql from backup.sh db) into
# an empty Supabase database. See docs/OPERATIONS.md.
#
#   restore.sh <backup-dir> <db-url>
set -euo pipefail
set +x

# shellcheck source=scripts/backup/secrets.sh
source "$(dirname "${BASH_SOURCE[0]}")/secrets.sh"

[ "$#" -eq 2 ] || {
  echo "usage: restore.sh <backup-dir> <db-url>" >&2
  exit 1
}
dir="$1"
db_url="$2"
for file in roles schema data; do
  [ -s "$dir/$file.sql" ] || {
    echo "$dir/$file.sql is missing or empty." >&2
    exit 1
  }
done

# psql's messages, with the URL and its password blanked. Its exit status is kept.
quietly_psql() {
  psql --dbname "$db_url" "$@" 2>&1 | SUPABASE_DB_URL="$db_url" redact >&2
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
