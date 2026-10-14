#!/usr/bin/env bash
# Local interactive setup; never replace an existing configuration.
set -euo pipefail
cd "$(dirname "$0")"
umask 077

fail() { printf '%s\n' "$1" >&2; exit 1; }

if [[ -e .env || -L .env ]]; then
  fail '.env esiste già: lasciato intatto. Per avviare la configurazione esistente, consulta docs/self-hosting.md.'
fi
[[ -t 0 ]] || fail 'Esegui questo installer in un terminale interattivo.'
command -v openssl >/dev/null 2>&1 || fail 'Installa OpenSSL prima di continuare.'
command -v docker >/dev/null 2>&1 || fail 'Installa Docker prima di continuare.'
docker compose version >/dev/null 2>&1 || fail 'Serve Docker Compose v2 con supporto --wait.'

printf '%s\n' 'Configura prima Discord seguendo docs/self-hosting.md.'
read -rp 'Discord Application ID: ' CLIENT_ID
[[ "$CLIENT_ID" =~ ^[0-9]{17,20}$ ]] || fail 'Application ID non valido.'
read -rsp 'Discord Client Secret (input nascosto): ' CLIENT_SECRET
printf '\n'
[[ "$CLIENT_SECRET" =~ ^[A-Za-z0-9_-]+$ ]] || fail 'Client Secret non valido.'
read -rsp 'Discord Bot Token (input nascosto): ' BOT_TOKEN
printf '\n'
[[ "$BOT_TOKEN" =~ ^[A-Za-z0-9_.-]+$ ]] || fail 'Bot Token non valido.'

read -rp 'Porta locale della dashboard [3000]: ' PORT
PORT=${PORT:-3000}
[[ "$PORT" =~ ^[0-9]{1,5}$ ]] && ((10#$PORT >= 1 && 10#$PORT <= 65535)) || fail 'Porta non valida.'
PORT=$((10#$PORT))
read -rp "PUBLIC_URL [http://localhost:${PORT}]: " PUBLIC_URL
PUBLIC_URL=${PUBLIC_URL:-http://localhost:${PORT}}
PUBLIC_URL=${PUBLIC_URL%/}
[[ "$PUBLIC_URL" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]] || fail 'Usa un URL http(s) senza percorso, query o credenziali.'
if [[ "$PUBLIC_URL" =~ :([0-9]+)$ ]]; then
  URL_PORT=${BASH_REMATCH[1]}
  ((10#$URL_PORT >= 1 && 10#$URL_PORT <= 65535)) || fail 'Porta PUBLIC_URL non valida.'
  PUBLIC_URL=${PUBLIC_URL%:*}:$((10#$URL_PORT))
fi
if [[ "$PUBLIC_URL" == http://* && ! "$PUBLIC_URL" =~ ^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$ ]]; then
  fail 'HTTP è consentito solo su localhost/127.0.0.1; per accesso remoto configura HTTPS.'
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

printf 'Configurazione salvata in .env (privata). Redirect Discord: %s/api/auth/callback\n' "$PUBLIC_URL"
printf '%s\n' 'La dashboard resta su loopback. HTTPS richiede un reverse proxy configurato separatamente.'
read -rp 'Scaricare le immagini/dipendenze, compilare e avviare Docker e il bot Discord? Scrivi AVVIA: ' CONFIRM
if [[ "$CONFIRM" != AVVIA ]]; then
  printf '%s\n' 'Nessun servizio avviato. Per continuare, segui docs/self-hosting.md.'
  exit 0
fi
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 180
printf 'Dashboard pronta: %s (controlla anche i log del bot).\n' "$PUBLIC_URL"
