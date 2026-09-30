#!/usr/bin/env bash
# Encrypted backups of the production database and Storage (#248), used by the Backups workflow
# and by Deploy Production before it migrates. See docs/OPERATIONS.md for restoring.
#
#   backup.sh db <label> <out-dir>
#       Dumps roles, schema and data (auth and storage included) from $SUPABASE_DB_URL.
#   backup.sh storage <label> <out-dir> <project-ref | --local>
#       Copies the proof and avatars buckets.
#   backup.sh push <subdir> <file>...
#       Commits sealed files to $BACKUP_REPO (default Aaron-Wickham/dwell-duel-backups) under
#       <subdir>/, with $BACKUP_REPO_TOKEN, and drops files older than $BACKUP_RETENTION_DAYS (60).
#       $BACKUP_REMOTE overrides the remote URL, for trying it against a local bare repo.
#
# db and storage write one sealed file, <out-dir>/<UTC time>-<label>.tar.gz.age, encrypted to
# $BACKUP_AGE_RECIPIENT, and print its path(s). Nothing unencrypted leaves the temporary directory,
# and nothing from the dump is printed.
set -euo pipefail
umask 077

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUCKETS=(proof avatars)
# GitHub rejects files over 100 MB.
PART_SIZE=95m

die() {
  echo "::error::$*" >&2
  exit 1
}

need_recipient() {
  [[ "${BACKUP_AGE_RECIPIENT:-}" == age1* ]] || die "BACKUP_AGE_RECIPIENT must be an age public key (age1...)."
}

need() {
  for tool in "$@"; do
    command -v "$tool" >/dev/null || die "$tool is not installed."
  done
}

absolute_dir() {
  mkdir -p "$1"
  (cd "$1" && pwd)
}

WORK=""
cleanup() {
  if [ -n "$WORK" ]; then rm -rf "$WORK"; fi
}
trap cleanup EXIT

make_work() {
  WORK="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/dwellduel-backup.XXXXXX")"
}

# tar | gzip | age, split into parts GitHub accepts when it's large.
seal() {
  local src="$1" out_dir="$2" label="$3"
  local out
  out="$out_dir/$(date -u +%Y-%m-%dT%H%M%SZ)-$label.tar.gz.age"
  tar -C "$src" -cf - . | gzip -9 | age -r "$BACKUP_AGE_RECIPIENT" -o "$out"
  local size
  size=$(wc -c <"$out" | tr -d ' ')
  if [ "$size" -gt $((95 * 1024 * 1024)) ]; then
    split -b "$PART_SIZE" "$out" "$out.part-"
    rm -f "$out"
    ls "$out".part-*
  else
    echo "$out"
  fi
}

dump_db() {
  local label="$1" out_dir="$2"
  [ -n "${SUPABASE_DB_URL:-}" ] || die "SUPABASE_DB_URL is not set."
  need supabase age gzip tar
  need_recipient
  out_dir="$(absolute_dir "$out_dir")"
  make_work
  mkdir "$WORK/db"
  # Run from the repo so the CLI dumps with the Postgres major version in supabase/config.toml.
  cd "$REPO_ROOT"
  supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f "$WORK/db/roles.sql" >&2
  supabase db dump --db-url "$SUPABASE_DB_URL" -f "$WORK/db/schema.sql" >&2
  # Every schema but the platform's own, so auth.users and storage.objects come along.
  supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy -f "$WORK/db/data.sql" >&2
  for file in roles schema data; do
    [ -s "$WORK/db/$file.sql" ] || die "The $file dump is empty."
  done
  grep -q '^COPY "auth"."users"' "$WORK/db/data.sql" || die "The data dump has no auth.users."
  grep -q '^COPY "public"."coin_transactions"' "$WORK/db/data.sql" || die "The data dump has no coin_transactions."
  seal "$WORK/db" "$out_dir" "$label"
}

copy_storage() {
  local label="$1" out_dir="$2" target="$3"
  need supabase age gzip tar
  need_recipient
  local flags=(--experimental)
  if [ "$target" = "--local" ]; then flags+=(--local); else flags+=(--project-ref "$target"); fi
  out_dir="$(absolute_dir "$out_dir")"
  make_work
  mkdir "$WORK/storage"
  cd "$REPO_ROOT"
  for bucket in "${BUCKETS[@]}"; do
    # Into the parent: the CLI adds the bucket's own name to the destination.
    supabase storage cp -r "ss:///$bucket" "$WORK/storage" "${flags[@]}" --jobs 4 >/dev/null 2>&1 ||
      die "Copying the $bucket bucket failed."
  done
  echo "Copied $(find "$WORK/storage" -type f | wc -l | tr -d ' ') objects." >&2
  seal "$WORK/storage" "$out_dir" "$label"
}

cutoff_date() {
  local days="$1"
  date -u -d "-$days days" +%F 2>/dev/null || date -u -v-"$days"d +%F
}

# The backups repo keeps a single commit: encrypted files don't delta, so history would only grow.
# Each push rebuilds that commit from the files already there, the new ones, minus the expired, and
# force-pushes it with a lease so two writers can't drop each other's files.
push_backups() {
  local subdir="$1"
  shift
  [ "$#" -gt 0 ] || die "Nothing to push."
  [ -n "${BACKUP_REPO_TOKEN:-}" ] || die "BACKUP_REPO_TOKEN is not set."
  local repo="${BACKUP_REPO:-Aaron-Wickham/dwell-duel-backups}"
  local keep_days="${BACKUP_RETENTION_DAYS:-60}"
  need git
  local auth
  auth="$(printf 'x-access-token:%s' "$BACKUP_REPO_TOKEN" | base64 | tr -d '\n')"
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::add-mask::$auth"; fi
  local files=()
  for file in "$@"; do files+=("$(cd "$(dirname "$file")" && pwd)/$(basename "$file")"); done
  make_work
  local cutoff
  cutoff="$(cutoff_date "$keep_days")"
  local attempt
  for attempt in 1 2 3 4 5; do
    rm -rf "$WORK/repo"
    git init -q -b main "$WORK/repo"
    local g=(git -C "$WORK/repo" -c "http.extraHeader=Authorization: Basic $auth"
      -c user.name="DwellDuel backups" -c user.email="backups@users.noreply.github.com")
    "${g[@]}" remote add origin "${BACKUP_REMOTE:-https://github.com/$repo.git}"
    local lease=""
    if "${g[@]}" fetch -q --depth 1 origin main 2>/dev/null; then
      lease="$("${g[@]}" rev-parse FETCH_HEAD)"
      "${g[@]}" checkout -q FETCH_HEAD -- .
    fi
    mkdir -p "$WORK/repo/$subdir"
    cp "${files[@]}" "$WORK/repo/$subdir/"
    local expired
    for expired in "$WORK"/repo/*/*; do
      [ -f "$expired" ] || continue
      if [[ "$(basename "$expired")" < "$cutoff" ]]; then rm -f "$expired"; fi
    done
    "${g[@]}" add -A
    "${g[@]}" commit -q -m "Backups as of $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    if "${g[@]}" push -q --force-with-lease="main:$lease" origin HEAD:main; then
      echo "Pushed ${#files[@]} file(s) to $repo/$subdir; kept backups from $cutoff on." >&2
      return 0
    fi
    echo "The push to $repo lost a race (attempt $attempt); trying again." >&2
    sleep $((attempt * 5))
  done
  die "Could not push to $repo."
}

cmd="${1:-}"
shift || true
case "$cmd" in
  db)
    [ "$#" -eq 2 ] || die "usage: backup.sh db <label> <out-dir>"
    dump_db "$@"
    ;;
  storage)
    [ "$#" -eq 3 ] || die "usage: backup.sh storage <label> <out-dir> <project-ref | --local>"
    copy_storage "$@"
    ;;
  push)
    [ "$#" -ge 2 ] || die "usage: backup.sh push <subdir> <file>..."
    push_backups "$@"
    ;;
  *)
    die "usage: backup.sh db|storage|push ..."
    ;;
esac
