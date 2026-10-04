#!/usr/bin/env bash
# PostToolUse hook for Edit/Write/MultiEdit: lints the file just changed the way CI does
# (`eslint --max-warnings 0`), so a warning surfaces now rather than as a red PR. Exit 2 hands
# ESLint's output back to Claude to fix; the edit itself has already happened.
set -euo pipefail

file_path="$(jq -r '.tool_input.file_path // empty')"
repo="${CLAUDE_PROJECT_DIR:-$(pwd)}"

case "$file_path" in
  "$repo"/*) ;;
  *) exit 0 ;;
esac
case "$file_path" in
  *.ts|*.tsx|*.mts|*.mjs|*.js) ;;
  *) exit 0 ;;
esac
[[ -f "$file_path" ]] || exit 0

cd "$repo"
if ! output="$(npx --no-install eslint --max-warnings 0 --no-warn-ignored "$file_path" 2>&1)"; then
  echo "ESLint (CI runs it with --max-warnings 0):" >&2
  echo "$output" >&2
  exit 2
fi
