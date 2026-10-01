# shellcheck shell=bash
# Sourced by the backup scripts: the forms a secret can take in a log, and a filter that blanks them.
# The Actions runner masks a secret's whole value, not the password inside a URL, and a tool can
# print that password alone, percent-decoded, re-encoded in its own spelling, or wrapped.

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

# Splits a scheme://user:password@host/... URL into DB_URL_HEAD (scheme://user),
# DB_URL_PASSWORD (as written, possibly empty) and DB_URL_TAIL (@host/...). The userinfo is the
# authority's, which ends at the first / ? or #, so an @ in the path or query isn't taken for it.
# A password written with an unencoded / ? or # has no @ in that authority; then the userinfo runs
# to the last @. Returns 1 when the URL has no password.
# shellcheck disable=SC2034 # DB_URL_HEAD and DB_URL_TAIL are for restore.sh.
split_db_url() {
  DB_URL_HEAD="" DB_URL_PASSWORD="" DB_URL_TAIL=""
  case "$1" in *://*) ;; *) return 1 ;; esac
  local scheme="${1%%://*}" rest="${1#*://}"
  local authority="${rest%%[/?#]*}" userinfo
  case "$authority" in
    *@*) userinfo="${authority%@*}" ;;
    *)
      case "$rest" in *@*) ;; *) return 1 ;; esac
      userinfo="${rest%@*}"
      ;;
  esac
  case "$userinfo" in *:*) ;; *) return 1 ;; esac
  DB_URL_HEAD="$scheme://${userinfo%%:*}"
  DB_URL_PASSWORD="${userinfo#*:}"
  DB_URL_TAIL="${rest:${#userinfo}}"
  [ -n "$DB_URL_PASSWORD" ]
}

# The password in a postgres:// URL as written, percent-decoded and percent-encoded, one per line
# and each once; nothing when the URL has none.
db_password_forms() {
  split_db_url "$1" || return 0
  local decoded encoded
  decoded="$(percent_decode "$DB_URL_PASSWORD")"
  encoded="$(percent_encode "$decoded")"
  printf '%s\n' "$DB_URL_PASSWORD" "$decoded" "$encoded" | awk 'NF && !seen[$0]++'
}

# The header git authenticates to the backups repo with, base64 of x-access-token:<token>.
repo_auth() {
  printf 'x-access-token:%s' "$1" | base64 | tr -d '\n'
}

# $SUPABASE_DB_URL and $BACKUP_REPO_TOKEN in every form above, one per line, longest first so a
# secret that contains another is blanked whole. These are what mask-secrets.sh masks.
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

# What redact hides a whole line for, compared with the line both as printed and percent-decoded:
# the first and last 8 characters of the decoded password, the token and the auth header (all of
# a shorter one). A line holding the secret in any percent-encoding holds both ends once decoded;
# a tool that wraps a secret of 16 or more characters leaves at least 8 of it on one line.
secret_fragments() {
  local s
  {
    if [ -n "${SUPABASE_DB_URL:-}" ] && split_db_url "$SUPABASE_DB_URL"; then
      percent_decode "$DB_URL_PASSWORD"
      echo
    fi
    if [ -n "${BACKUP_REPO_TOKEN:-}" ]; then
      printf '%s\n' "$BACKUP_REPO_TOKEN"
      repo_auth "$BACKUP_REPO_TOKEN"
      echo
    fi
  } | while IFS= read -r s; do
    if [ "${#s}" -le 8 ]; then
      printf '%s\n' "$s"
    else
      printf '%s\n' "${s:0:8}" "${s:${#s}-8}"
    fi
  done | awk 'NF && !seen[$0]++'
}

# Copies stdin to stdout with every secret_forms value replaced by ***, and any line that still
# holds a secret_fragments value, as printed or once percent-decoded, replaced by a notice. If the
# secrets can't be listed, it prints nothing rather than the text unblanked.
redact() {
  local secrets=() fragments=() forms frags line decoded s hidden
  if ! forms="$(secret_forms)" || ! frags="$(secret_fragments)"; then
    echo "(output hidden: couldn't list the secrets to blank)"
    cat >/dev/null
    return 0
  fi
  while IFS= read -r s; do
    if [ -n "$s" ]; then secrets+=("$s"); fi
  done <<<"$forms"
  while IFS= read -r s; do
    if [ -n "$s" ]; then fragments+=("$s"); fi
  done <<<"$frags"
  while IFS= read -r line || [ -n "$line" ]; do
    for s in ${secrets[@]+"${secrets[@]}"}; do line="${line//"$s"/***}"; done
    hidden=""
    case "$line" in
      *%*) decoded="$(percent_decode "$line")" ;;
      *) decoded="$line" ;;
    esac
    for s in ${fragments[@]+"${fragments[@]}"}; do
      if [[ "$line" == *"$s"* || "$decoded" == *"$s"* ]]; then
        hidden=1
        break
      fi
    done
    if [ -n "$hidden" ]; then
      echo "(a line was hidden here: it held part of a secret)"
    else
      printf '%s\n' "$line"
    fi
  done
}
