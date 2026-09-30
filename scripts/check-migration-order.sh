#!/usr/bin/env bash
# Fails when this branch adds a migration numbered at or below the newest one on the base branch
# (#249). `supabase db push` refuses a migration that sorts before production's latest, and CI's
# fresh database can't notice, so two PRs merged out of order would stop the next deploy.
#
#   check-migration-order.sh [base-ref]    (default origin/main)
set -euo pipefail

base="${1:-origin/main}"
dir=supabase/migrations

number() {
  basename "$1" | sed -E 's/^([0-9]+)_.*/\1/'
}

base_files="$(git ls-tree --name-only "$base" "$dir/" | grep -E '/[0-9]+_[^/]*\.sql$' || true)"
latest=0
for file in $base_files; do
  n=$((10#$(number "$file")))
  if [ "$n" -gt "$latest" ]; then latest=$n; fi
done

status=0
for file in "$dir"/*.sql; do
  if ! grep -qxF "$file" <<<"$base_files"; then
    n=$((10#$(number "$file")))
    if [ "$n" -le "$latest" ]; then
      echo "::error file=$file::$file is numbered $n, but $base already has migrations up to $latest. Renumber it above $latest."
      status=1
    else
      echo "$file comes after $base's latest migration ($latest)."
    fi
  fi
done

dupes="$(for file in "$dir"/*.sql; do number "$file"; done | sort | uniq -d)"
if [ -n "$dupes" ]; then
  echo "::error::More than one migration shares the number(s): $dupes"
  status=1
fi

exit "$status"
