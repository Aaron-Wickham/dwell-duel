#!/usr/bin/env bash
# PreToolUse hook for Edit/Write/MultiEdit: refuses hand edits to files that must come from
# somewhere else. database.types.ts is generated from the local schema, and CI fails when it
# doesn't match; .env files hold secrets and per-machine values (.env.local.example is the
# checked-in template and can be edited).
set -euo pipefail

file_path="$(jq -r '.tool_input.file_path // empty')"
name="$(basename "$file_path")"

if [[ "$file_path" == */lib/supabase/database.types.ts ]]; then
  echo "lib/supabase/database.types.ts is generated. Run \`npm run db:reset\`, then \`npx supabase gen types typescript --local > lib/supabase/database.types.ts\`." >&2
  exit 2
fi

if [[ "$name" == .env* && "$name" != ".env.local.example" ]]; then
  echo "$name holds secrets or per-machine values, so Claude doesn't edit it. Ask Aaron to change it; a new variable's placeholder goes in .env.local.example and lib/env/required.ts." >&2
  exit 2
fi
