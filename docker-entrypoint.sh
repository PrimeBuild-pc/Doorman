#!/bin/sh
set -e

# db push (not migrate deploy) is deliberate: Doorman is a single-tenant, self-hosted
# app with no migrations/ history to ship, same spirit as Gnosis's plain numbered SQL
# files — syncing the schema directly is the simplest thing that's correct here.
pnpm --filter @doorman/database exec prisma db push --skip-generate --accept-data-loss=false

if [ "$SERVICE" = "web" ]; then
  exec pnpm --filter @doorman/web start
else
  exec node apps/bot/dist/index.js
fi
