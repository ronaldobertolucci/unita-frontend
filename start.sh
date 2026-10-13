#!/bin/sh
set -eu

# Executed by the official nginx entrypoint before template substitution.
api_url=${API_URL:-/api}
api_upstream=${API_UPSTREAM:-http://app:8080}
production=${PRODUCTION:-true}
frontend_root=${FRONTEND_ROOT:-/usr/share/nginx/html}

case "$api_url$api_upstream" in
  *[!A-Za-z0-9./:_-]*)
    echo 'API_URL and API_UPSTREAM contain unsupported characters.' >&2
    exit 1
    ;;
esac

# These public settings are emitted as JavaScript/nginx configuration.
# Reject delimiters, credentials, query strings and unexpected context paths.
if ! printf '%s\n' "$api_url" | grep -Eq '^(/api|https?://[A-Za-z0-9._-]+(:[0-9]+)?/api)$'; then
  echo 'API_URL must be /api or an HTTP(S) origin followed by /api (without trailing slash).' >&2
  exit 1
fi
if ! printf '%s\n' "$api_upstream" | grep -Eq '^http://[A-Za-z0-9._-]+(:[0-9]+)?$'; then
  echo 'API_UPSTREAM must be an internal HTTP origin, without path or credentials.' >&2
  exit 1
fi
case "$production" in
  true|false) ;;
  *) echo 'PRODUCTION must be true or false.' >&2; exit 1 ;;
esac
export API_UPSTREAM="$api_upstream"

mkdir -p "$frontend_root/assets"
printf 'window.__env = { apiUrl: "%s", production: %s };\n' \
  "$api_url" "$production" > "$frontend_root/assets/env.js.tmp"
mv "$frontend_root/assets/env.js.tmp" "$frontend_root/assets/env.js"
