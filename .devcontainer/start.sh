#!/usr/bin/env bash
# Starts the CARGO ONE server in the background on every Codespace start. Log: $DATA_DIR/server.log
set -e
mkdir -p "${DATA_DIR:-.data}"
[ -d dist ] || npm run build
# Session secret generated once per Codespace and kept in the data directory (not in the repository).
SECRET_FILE="${DATA_DIR:-.data}/auth-secret"
[ -f "$SECRET_FILE" ] || head -c 48 /dev/urandom | base64 > "$SECRET_FILE"
export AUTH_SECRET="$(cat "$SECRET_FILE")"
if [ -n "$CODESPACE_NAME" ]; then
  export ALLOWED_ORIGIN_HOSTS="${CODESPACE_NAME}-${PORT:-3000}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
fi
case ",${IMAGE_HOSTS}," in *",aliexpress-media.com,"*) ;; *) export IMAGE_HOSTS="${IMAGE_HOSTS:+$IMAGE_HOSTS,}alicdn.com,aliexpress-media.com" ;; esac
pkill -f "server/server.mjs" 2>/dev/null || true
nohup setsid node --disable-warning=ExperimentalWarning server/server.mjs > "${DATA_DIR:-.data}/server.log" 2>&1 &
# Safari on iPhone often cannot open PRIVATE forwarded ports (blocked GitHub cookies → blank page).
# The port is made public instead; the site itself is protected by the SITE_PASSWORD_SHA256 password.
if [ -n "$CODESPACE_NAME" ] && command -v gh >/dev/null; then
  (sleep 8; gh codespace ports visibility 3000:public -c "$CODESPACE_NAME" >/dev/null 2>&1 || true) &
  echo "Open: https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
fi
echo "CARGO ONE starting on port ${PORT:-3000} (open the Ports tab)."
