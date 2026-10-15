#!/usr/bin/env bash
# Local interactive setup; never replace an existing configuration.
set -euo pipefail
cd "$(dirname "$0")"
umask 077

fail() { printf '%s\n' "$1" >&2; exit 1; }

if [[ -e .env || -L .env ]]; then
  fail '.env already exists: left untouched. To start the existing configuration, see docs/self-hosting.md.'
fi
[[ -t 0 ]] || fail 'Run this installer in an interactive terminal.'
command -v openssl >/dev/null 2>&1 || fail 'Install OpenSSL before continuing.'
command -v docker >/dev/null 2>&1 || fail 'Install Docker before continuing.'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 with --wait support is required.'

printf '%s\n' 'First configure Discord following docs/self-hosting.md.'
read -rp 'Discord Application ID: ' CLIENT_ID
[[ "$CLIENT_ID" =~ ^[0-9]{17,20}$ ]] || fail 'Invalid Application ID.'
read -rsp 'Discord Client Secret (hidden input): ' CLIENT_SECRET
printf '\n'
[[ "$CLIENT_SECRET" =~ ^[A-Za-z0-9_-]+$ ]] || fail 'Invalid Client Secret.'
read -rsp 'Discord Bot Token (hidden input): ' BOT_TOKEN
printf '\n'
[[ "$BOT_TOKEN" =~ ^[A-Za-z0-9_.-]+$ ]] || fail 'Invalid Bot Token.'

read -rp 'Local dashboard port [3000]: ' PORT
PORT=${PORT:-3000}
[[ "$PORT" =~ ^[0-9]{1,5}$ ]] && ((10#$PORT >= 1 && 10#$PORT <= 65535)) || fail 'Invalid port.'
PORT=$((10#$PORT))
read -rp "PUBLIC_URL [http://localhost:${PORT}]: " PUBLIC_URL
PUBLIC_URL=${PUBLIC_URL:-http://localhost:${PORT}}
PUBLIC_URL=${PUBLIC_URL%/}
[[ "$PUBLIC_URL" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]] || fail 'Use an http(s) URL without a path, query or credentials.'
if [[ "$PUBLIC_URL" =~ :([0-9]+)$ ]]; then
  URL_PORT=${BASH_REMATCH[1]}
  ((10#$URL_PORT >= 1 && 10#$URL_PORT <= 65535)) || fail 'Invalid PUBLIC_URL port.'
  PUBLIC_URL=${PUBLIC_URL%:*}:$((10#$URL_PORT))
fi
if [[ "$PUBLIC_URL" == http://* && ! "$PUBLIC_URL" =~ ^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$ ]]; then
  fail 'HTTP is allowed only on localhost/127.0.0.1; configure HTTPS for remote access.'
fi

AUTH_SECRET=$(openssl rand -hex 32)
PG_PASSWORD=$(openssl rand -hex 32)
# noclobber also protects against a file created between the check and this write.
set -o noclobber
{
  printf 'DISCORD_CLIENT_ID=%s\n' "$CLIENT_ID"
  printf 'DISCORD_CLIENT_SECRET=%s\n' "$CLIENT_SECRET"
  printf 'DISCORD_BOT_TOKEN=%s\n' "$BOT_TOKEN"
  printf 'AUTH_SECRET=%s\n' "$AUTH_SECRET"
  printf 'POSTGRES_PASSWORD=%s\n' "$PG_PASSWORD"
  printf 'PUBLIC_URL=%s\n' "$PUBLIC_URL"
  printf 'DOORMAN_BIND_ADDRESS=127.0.0.1\nDOORMAN_PORT=%s\n' "$PORT"
} > .env
unset CLIENT_SECRET BOT_TOKEN AUTH_SECRET PG_PASSWORD

printf 'Configuration saved in .env (private). Discord redirect: %s/api/auth/callback\n' "$PUBLIC_URL"
printf '%s\n' 'The dashboard stays on loopback. HTTPS requires a separately configured reverse proxy.'
read -rp 'Download images/dependencies, build and start Docker and the Discord bot? Type START: ' CONFIRM
if [[ "$CONFIRM" != START ]]; then
  printf '%s\n' 'No services started. To continue, follow docs/self-hosting.md.'
  exit 0
fi
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 180
printf 'Dashboard ready: %s (also check the bot logs).\n' "$PUBLIC_URL"
