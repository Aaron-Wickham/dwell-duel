#!/usr/bin/env bash
# Checks what a workflow captured from `backup.sh db|storage` before it goes anywhere else:
#
#   check-sealed.sh <out-dir> <<<"$SEALED"
#
# Passes only when there is at least one line and every line is a sealed file backup.sh wrote
# directly into <out-dir>. Anything else fails without printing the line, which could hold a
# secret.
set -euo pipefail
set +x

fail() {
  echo "::error::$*" >&2
  exit 1
}

[ "$#" -eq 1 ] || fail "usage: check-sealed.sh <out-dir> <<<\"\$SEALED\""
[ -d "$1" ] || fail "The backup's output folder doesn't exist."
out_dir="$(cd "$1" && pwd)"

name_pattern='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z-[A-Za-z0-9._-]+\.tar\.gz\.age(\.part-[a-z]+)?$'
count=0
while IFS= read -r line || [ -n "$line" ]; do
  count=$((count + 1))
  name="${line#"$out_dir"/}"
  if [ "$line" = "$name" ] || ! [[ "$name" =~ $name_pattern ]] || [ ! -f "$line" ] || [ -L "$line" ]; then
    fail "Line $count of the backup's output isn't a sealed file in its output folder, so nothing was pushed. (The line isn't shown: it could hold a secret.)"
  fi
done

[ "$count" -gt 0 ] || fail "The backup printed no sealed file, so nothing was pushed."
