# shellcheck shell=bash
# Sourced by the backup scripts: the forms a secret can take in a log, and a filter that blanks them.
# The Actions runner masks a secret's whole value, not the password inside a URL, and a tool can
# print that password alone, percent-decoded, or re-encoded.

percent_decode() {
  local s="${1//\\/\\\\}"
  printf '%b' "${s//%/\\x}"
}

percent_encode() {
  local LC_ALL=C s="$1" out="" c i code
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in
      [A-Za-z0-9._~-]) out+="$c" ;;
      *)
        code="$(printf '%d' "'$c")"
        out+="$(printf '%%%02X' "$((code & 255))")"
        ;;
    esac
  done
  printf '%s' "$out"
}

# The password in a postgres:// URL as written, percent-decoded and percent-encoded, one per line
# and each once; nothing when the URL has none.
db_password_forms() {
  local rest="${1#*://}"
  case "$rest" in *@*) ;; *) return 0 ;; esac
  local userinfo="${rest%@*}"
  case "$userinfo" in *:*) ;; *) return 0 ;; esac
  local password="${userinfo#*:}"
  [ -n "$password" ] || return 0
  local decoded encoded
  decoded="$(percent_decode "$password")"
  encoded="$(percent_encode "$decoded")"
  printf '%s\n' "$password" "$decoded" "$encoded" | awk 'NF && !seen[$0]++'
}

# The header git authenticates to the backups repo with, base64 of x-access-token:<token>.
repo_auth() {
  printf 'x-access-token:%s' "$1" | base64 | tr -d '\n'
}

# $SUPABASE_DB_URL and $BACKUP_REPO_TOKEN in every form above, one per line, longest first so a
# secret that contains another is blanked whole.
secret_forms() {
  {
    if [ -n "${SUPABASE_DB_URL:-}" ]; then
      printf '%s\n' "$SUPABASE_DB_URL"
      db_password_forms "$SUPABASE_DB_URL"
    fi
    if [ -n "${BACKUP_REPO_TOKEN:-}" ]; then
      printf '%s\n' "$BACKUP_REPO_TOKEN"
      repo_auth "$BACKUP_REPO_TOKEN"
      echo
    fi
  } | awk 'NF && !seen[$0]++ { print length($0) "\t" $0 }' | sort -rn | cut -f2-
}

# Copies stdin to stdout with every secret_forms value replaced by ***. If the secrets can't be
# listed, it prints nothing rather than the text unblanked.
redact() {
  local secrets=() forms line s
  if ! forms="$(secret_forms)"; then
    echo "(output hidden: couldn't list the secrets to blank)"
    cat >/dev/null
    return 0
  fi
  while IFS= read -r s; do
    if [ -n "$s" ]; then secrets+=("$s"); fi
  done <<<"$forms"
  while IFS= read -r line || [ -n "$line" ]; do
    for s in ${secrets[@]+"${secrets[@]}"}; do line="${line//"$s"/***}"; done
    printf '%s\n' "$line"
  done
}
