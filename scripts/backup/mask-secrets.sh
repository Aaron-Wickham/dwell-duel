#!/usr/bin/env bash
# Registers Actions log masks for every form of $SUPABASE_DB_URL's password and $BACKUP_REPO_TOKEN
# (see secrets.sh), then records in $GITHUB_ENV which it masked, which backup.sh checks for.
#
# Run it as its own step, before any step that uses these secrets. The runner only sees a
# ::add-mask:: line on the step's own stdout: one printed inside $(...) is captured instead, and
# the secret it names is never masked.
set -euo pipefail
set +x

# shellcheck source=scripts/backup/secrets.sh
source "$(dirname "${BASH_SOURCE[0]}")/secrets.sh"

if [ -z "${GITHUB_ACTIONS:-}" ]; then
  echo "mask-secrets.sh only does anything inside GitHub Actions." >&2
  exit 0
fi
[ -n "${GITHUB_ENV:-}" ] || {
  echo "::error::GITHUB_ENV is not set." >&2
  exit 1
}

masked=()
if [ -n "${SUPABASE_DB_URL:-}" ]; then masked+=(db-url); fi
if [ -n "${BACKUP_REPO_TOKEN:-}" ]; then masked+=(repo-token); fi
[ "${#masked[@]}" -gt 0 ] || {
  echo "::error::Neither SUPABASE_DB_URL nor BACKUP_REPO_TOKEN is set, so there is nothing to mask." >&2
  exit 1
}

forms="$(secret_forms)"
while IFS= read -r form; do
  if [ -n "$form" ]; then echo "::add-mask::$form"; fi
done <<<"$forms"

echo "BACKUP_MASKED=$(
  IFS=,
  echo "${masked[*]}"
)" >>"$GITHUB_ENV"
echo "Masked: ${masked[*]}." >&2
