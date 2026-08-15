#!/usr/bin/env bash
# Guided installer for Doorman: writes .env and starts the stack.
set -euo pipefail
cd "$(dirname "$0")"

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info() { printf "${BLUE}==>${NC} %s\n" "$1"; }
ok()   { printf "${GREEN}OK${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}!${NC} %s\n" "$1"; }

set_env() {
  local key="$1" value="$2"
  awk -v k="$key" -v v="$value" -F'=' '
    BEGIN { done = 0 }
    $1 == k { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' .env > .env.tmp && mv .env.tmp .env
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Install it first: https://docs.docker.com/get-docker/" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin not found ('docker compose')." >&2
  exit 1
fi

[ -f .env ] || cp .env.example .env

info "Discord app"
echo "  1. https://discord.com/developers/applications -> your app (or create one)"
echo "  2. Bot tab: enable the 'Server Members Intent' toggle, then Reset Token"
echo "  3. OAuth2 tab: add redirect '<your PUBLIC_URL>/api/auth/callback'"
read -rp "Discord Application ID: " CLIENT_ID
read -rp "Discord Client Secret: " CLIENT_SECRET
read -rsp "Discord Bot Token: " BOT_TOKEN
echo
set_env DISCORD_CLIENT_ID "$CLIENT_ID"
set_env DISCORD_CLIENT_SECRET "$CLIENT_SECRET"
set_env DISCORD_BOT_TOKEN "$BOT_TOKEN"

read -rp "Public URL this dashboard will be reachable at [http://localhost:3000]: " PUBLIC_URL
PUBLIC_URL=${PUBLIC_URL:-http://localhost:3000}
set_env PUBLIC_URL "$PUBLIC_URL"

read -rp "Port to expose the dashboard on [3000]: " PORT
PORT=${PORT:-3000}
set_env DOORMAN_PORT "$PORT"

AUTH_SECRET=$(openssl rand -base64 32)
set_env AUTH_SECRET "$AUTH_SECRET"

PG_PASSWORD=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)
set_env POSTGRES_PASSWORD "$PG_PASSWORD"
set_env DATABASE_URL "postgresql://doorman:${PG_PASSWORD}@db:5432/doorman"

ok "Configuration written to .env"

info "Building and starting Doorman"
docker compose up -d --build

ok "Doorman is starting. Dashboard: ${PUBLIC_URL}"
echo "Invite the bot to a server with the URL from the Discord Developer Portal's"
echo "OAuth2 URL Generator (scopes: bot + applications.commands; permissions:"
echo "View Channels, Send Messages, Attach Files, Manage Roles, Manage Guild)."
