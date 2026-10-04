#!/usr/bin/env bash
# PreToolUse hook for Edit/Write/MultiEdit: refuses to change a migration that is already on
# origin/main. Production applies migrations on merge and never re-reads an applied one, so an
# in-place edit silently diverges from what production ran; the change belongs in a new migration.
# A migration this branch added (not yet on main) can still be edited.
set -euo pipefail

file_path="$(jq -r '.tool_input.file_path // empty')"

if [[ ! "$file_path" =~ (supabase/migrations/[0-9]+_[^/]+\.sql)$ ]]; then
  exit 0
fi
rel="${BASH_REMATCH[1]}"

repo="${CLAUDE_PROJECT_DIR:-$(pwd)}"
if ! git -C "$repo" rev-parse --verify --quiet origin/main >/dev/null; then
  exit 0
fi

if git -C "$repo" cat-file -e "origin/main:$rel" 2>/dev/null; then
  echo "$rel is already on main, so production has applied it. Never edit a past migration in place: add a new one numbered after main's newest (see the new-migration skill)." >&2
  exit 2
fi
