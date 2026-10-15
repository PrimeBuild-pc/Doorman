# Development

TypeScript monorepo: Next.js in `apps/web`, discord.js in `apps/bot`, Prisma/PostgreSQL in `packages/database`, utilities/validation in `packages/shared`. Consult the `package.json` files for current scripts; `pnpm-workspace.yaml` also controls dependency build scripts.

## Dependencies and builds

Use Node 22.20+ and the pnpm version declared in `package.json`. With network consent:

```bash
corepack enable
corepack install --global pnpm@11.9.0
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

The recursive build compiles shared/database before the apps, which import them from their respective `dist` directories. Prisma Client is generated during the build: do not run `migrate deploy` expecting an initial schema, because there are no versioned migrations. `pnpm build` must not receive real Discord credentials or connect to Discord/DB. Avoid `pnpm format` across the entire repository for targeted changes.

With dependencies already installed, you can run checks without `install`. Report unavailable processes/binaries; do not download them automatically during checks authorized only for local execution. The web includes tests for sessions/OAuth, authorization and guild-isolated mutations, uploads and markup/accessibility. Bot/shared have tests for events, invites and permissions. The database workspace has no suite of its own: a “no tests” string is not an application test. The regular suite uses transaction mocks; the staging verification below also exercises locks and concurrency on real PostgreSQL.

## Interface languages

The dashboard and Discord interface support English (`en`), Italian (`it`), Spanish (`es`), Russian (`ru`) and Chinese (`zh`). Keep the installer, operational documentation, code comments and runtime logs in English. [Locale selection and fallback](../README.md#interface-languages) describe the public behavior.

English-source typed dictionaries live in `packages/shared/src/messages.ts` (dashboard) and `packages/shared/src/bot-messages.ts` (Discord). Add every new message to all five dictionaries; tests check key and placeholder parity. `i18n.ts` validates locales and negotiates browser preferences without dependencies. The dashboard reads locale per request, sets `<html lang>` and shares it with loading/error/not-found client components. The language form uses a same-origin Next.js Server Action and a one-year HttpOnly, SameSite=Lax cookie (Secure on HTTPS); it changes presentation only, not authentication or server data.

Dates use the selected locale with UTC, and interpolation leaves user content unchanged. Browser-native file-picker/validation text and Discord-owned UI follow those applications' own settings, not Doorman's dictionaries. Simplified Chinese is used for both Discord Chinese variants. For non-Docker deployments, install fonts covering Cyrillic and CJK for welcome-card rendering; Docker includes DejaVu and Noto CJK.

## Development runtime (authorized environments only)

`next dev`/the bot **do not automatically load the root `.env` the same way Compose does**. Configure variables privately in the terminal/process manager using a method that does not record their values; do not use an agent to read/source the actual `.env`. Use the names in `.env.example` and, outside Docker:

- `DATABASE_URL`: a development database reachable from the host (e.g. PostgreSQL on localhost; Compose does not publish the DB).
- `UPLOADS_DIR`: a writable local directory shared by web and bot.
- `PUBLIC_URL`: the dashboard origin without a trailing slash, with the exact redirect registered in the **test** Discord app.

With those variables already present and a development DB ready:

```bash
pnpm --filter @doorman/database exec prisma db push --skip-generate
pnpm dev:web
# In a second terminal with the same variables, only when authorized:
pnpm dev:bot
```

The bot registers commands and reacts to real joins: do not start it with production credentials for a compilation check. Changes to roles, queues or banners must be verified in a test server, with consent.

## Infrastructure

Run the [local checks without deployment](infra-checks.md). A real Docker build downloads base images and packages and requires separate authorization:

```bash
docker build -t doorman:local .
```

Do not start the default Compose project as an automatic test: schema modifies the database and bot connects to Discord. Runtime verification requires an explicitly authorized temporary environment; for base-image/hardening changes, check users, volume ownership, Prisma/native canvas and Next cache after every update.

### Isolated staging (only after authorization to download and start containers)

With Linux Docker, Compose v2, Git and Python 3:

```bash
docker build -t doorman:verification .
python scripts/verify-staging.py
```

The script does not read `.env`: it generates synthetic configuration and data outside the checkout. It refuses pre-existing resources in the `doorman-verification` project, chooses a free localhost port and starts only DB/schema/web with temporary volumes. It verifies non-root/read-only PostgreSQL initialization and restart, a populated previous schema from `HEAD` and a lossless upgrade, health checks and HTTP flows for denied login/invalid state/logout. It does not follow redirects to Discord.

The separate `apps/web/staging/staging.test.ts` suite uses real Prisma/PostgreSQL and filesystem access, but mocks sessions, authorization and the Discord API: it verifies concurrent approvals, advisory-lock waits observed in PostgreSQL, rejoins, rollbacks and PNG/JPEG/WebP decoding with native Sharp/canvas. It is not part of `pnpm test` and refuses to run without the staging marker. The bot is never started; its join handler is called with a synthetic member.

Final cleanup removes only containers/network/volumes from the created project, even after failure; the verification image and build cache remain available. The `HEAD` schema test does not simulate structural changes if `HEAD` and the working tree have the same schema. Successful OAuth, real Discord permissions and role assignments still require an authorized test server.
