#!/bin/sh
set -eu

case "${SERVICE:-}" in
  schema)
    # One Compose job owns schema changes; data-loss warnings remain fatal.
    exec node packages/database/node_modules/prisma/build/index.js db push \
      --schema packages/database/prisma/schema.prisma --skip-generate
    ;;
  web)
    exec node apps/web/node_modules/next/dist/bin/next start apps/web -p 3000 -H 0.0.0.0
    ;;
  bot)
    exec node apps/bot/dist/index.js
    ;;
  *)
    printf '%s\n' 'SERVICE must be schema, web or bot.' >&2
    exit 1
    ;;
esac
