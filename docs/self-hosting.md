# Self-hosting

## 1. Prerequisites and Discord

Use a host with Linux containers, Docker Engine/Desktop, a recent Docker Compose v2 (`--wait`, `service_completed_successfully` and `pull_policy`), Git, Bash and OpenSSL. On Windows, run the installer in WSL or Git Bash with Docker Desktop in Linux mode. Protect access to the Docker daemon: it is equivalent to administrative privileges on the host.

In the [Discord Developer Portal](https://discord.com/developers/applications):

1. Create an application; copy the **Application ID** from General Information.
2. Under **Bot**, enable **Server Members Intent**. Presence Intent and Message Content Intent are not needed; the code requires the non-privileged Guilds/GuildInvites intents. Verified apps must obtain Discord approval for privileged intents.
3. Generate/copy the Bot Token and, under **OAuth2**, the Client Secret. Store them in a password manager; do not paste them into chat, issues, screenshots or shell history.
4. Under **OAuth2 → Redirects**, add exactly `http://localhost:3000/api/auth/callback` for the local default; for HTTPS, use `https://doorman.example.org/api/auth/callback`. Scheme, host and port must match `PUBLIC_URL`, with no trailing slash in the origin. Login requires `identify guilds`, not permission to invite the bot.
5. Under **Installation**, choose Guild Install (if the portal requests it); under **OAuth2 → URL Generator**, select `bot` and `applications.commands`. Invite the app only to the desired server.

### Minimum permissions

- **Manage Roles** to assign roles. The Doorman role must be **above the roles to assign**, not above administrators/moderators. Exclude integration-managed roles and `@everyone`.
- Only in the welcome channel: **View Channel, Send Messages, Attach Files**. If you do not use cards, these permissions are not needed for that feature.
- **Manage Server / Manage Guild** only if you use invite-based roles: it is needed to read all invites and their counters. Without it, basic autorole still works, but invite attribution does not.
- **Administrator, Ban Members, Kick Members, Manage Channels, Message Content** are not needed. Denying approval does not remove the member: it does not grant them roles.

The dashboard user must be the owner or have Manage Server/Administrator. These are user permissions, not a reason to give the bot Administrator. Slash commands are global: their first registration may take time to propagate.

## 2. Install and verify

```bash
git clone --config core.autocrlf=false https://github.com/PrimeBuild-pc/Doorman.git
cd Doorman
bash install.sh
```

The installer saves `.env` with private permissions and separate random values for session encryption/the DB password; the token and Client Secret use hidden input. It refuses an existing `.env`, even if it is a link: it does not rotate credentials or passwords for already initialized databases. It accepts a local HTTP origin or HTTPS without a path. `DOORMAN_BIND_ADDRESS` remains `127.0.0.1`; the port is configurable. The installer is English-only; the dashboard and Discord interface support English (`en`), Italian (`it`), Spanish (`es`), Russian (`ru`) and Chinese (`zh`).

**Doorman and D-View on the same homelab:** both default to port 3000.
In the Doorman installer, choose **3001**, use `PUBLIC_URL=http://localhost:3001`
and register `http://localhost:3001/api/auth/callback` in Discord. D-View can stay
on 3000 and Gnosis on 8080. Keep Discord apps, `.env` files, databases and volumes
separate; do not reuse tokens or passwords. In the SSH tunnel, use
`-L 3001:127.0.0.1:3001` and open `http://localhost:3001`.

Only typing `START` authorizes downloads, builds and the bot's connection to Discord. If you cancel after saving, start later with:

```bash
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 180
docker compose ps -a
docker compose logs --tail=80 schema bot web
```

`config --quiet` validates without printing secrets; avoid `docker compose config` without this option. Do not publish raw logs without review/redaction. `--wait` checks PostgreSQL and HTTP; **it does not certify the bot's Discord login**: check the logs for the login message and expected server.

The database publishes no host ports. The DB check uses TCP to wait for the final server, not the temporary initialization server. The `schema` job performs a single Prisma synchronization and must exit with code 0 before bot/web. There are no versioned migrations: `db push` refuses changes that require accepting data loss; do not force the acceptance flag.

Containers use non-root users, read-only root filesystems and no additional capabilities. Only DB/banners/temporary caches are writable. The bot mounts banners read-only. Dependencies are installed with the lockfile required and pnpm pinned; bot/web/schema use the same locally built image, not a remote `latest`. Base versions are pinned to explicit tags; tags and apt repositories are not immutable: byte-identical builds would require verified digests and apt snapshots. Update base images periodically with vulnerability checks and tests.

Open `http://localhost:3000`, log in with Discord, choose the server, configure non-privileged roles and, if desired, the channel/banner/account-age threshold. First try a test server with an authorized account: verifying role assignment, messages and approvals really changes Discord.

### Operational limits and server security

You can invite the same app to multiple servers: every setting and mutation remains scoped to the server ID. The session cookie is encrypted and authenticated; it does not contain the server list. OAuth permissions and the bot's presence are rechecked on every page/change: an error or revocation blocks access. Old sessions from the previous version are invalidated; token expiration or `AUTH_SECRET` rotation requires a new login.

Roles with administrative/moderation privileges, including through channel/category overrides, are excluded and revalidated before being granted. This does not replace a Discord permission review: a role may grant access to private channels or other bots' features. Use only low-privilege entry roles.

Banners accept single PNG/JPEG/WebP images up to 5 MiB and 16 megapixels; they are decoded and resampled to 1024×450 PNG. Replacements normally remove the previous file; concurrent uploads/interruptions may leave unused files, to be cleaned up only after backup and comparison with the DB.

A rejoin supersedes previous pending requests; approval checks the current join timestamp on Discord. Old requests created before this version may be rejected because they used a local timestamp: privately verify the member and roles in Discord and deny/archive the obsolete request. Denying does not remove existing roles, kick or ban.

SQL and Discord are not a single transaction: an error during approval may grant some roles while leaving the request pending. Check Discord before retrying; role PUTs are idempotent. Permissions or membership can also change between the check and API call: do not use this bot as a high-assurance access-control system. The queue shows at most 100 members per page; after decisions, reload to see others. Configuration data and history remain in the DB if the bot leaves a server; plan cleanup/retention and backups according to the community's needs.

## 3. Remote access

To administer from another computer without exposing ports:

```bash
ssh -N -L 3000:127.0.0.1:3000 user@doorman-host
```

Open `http://localhost:3000` on the browser computer; keep the local origin and redirect. If the host port differs, change the second `3000`; the first must match the browser URL.

For a public domain, configure a reverse proxy on the host with a valid TLS certificate pointing to `127.0.0.1:3000`. Privately set `PUBLIC_URL=https://doorman.example.org`, register the identical redirect in Discord and recreate the services:

```bash
docker compose up -d --build --wait --wait-timeout 180
```

The web must use the `PUBLIC_URL` scheme for `Secure` cookies: HTTPS even if the proxy speaks HTTP to the app, HTTP only for the local default. Protect the proxy with a firewall and preserve Host/forwarded headers without trusting client-supplied values. A proxy in another container requires dedicated networking/configuration: `127.0.0.1` in that container is not the host. Do not change the bind to `0.0.0.0` as an HTTPS shortcut.

## 4. Consistent backups

Save the database, banners, `.env` and code commit. Archives contain personal data; keep encrypted off-host copies and test restoration. Run from the root, with available disk space; services remain stopped if a command fails: restart them only after resolving the problem.

```bash
set -e
umask 077
BACKUP="$(dirname "$PWD")/doorman-backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP"
chmod 700 "$BACKUP"
docker compose stop bot web
docker compose exec -T db pg_dump -U doorman -d doorman -Fc > "$BACKUP/database.dump"
docker compose run --rm --no-deps -T --entrypoint tar web \
  -C /data/uploads -czf - . > "$BACKUP/uploads.tar.gz"
cp -p .env "$BACKUP/env.private"
git rev-parse HEAD > "$BACKUP/commit.txt"
docker compose start bot web
```

The default path is outside the checkout: keep any alternative paths outside the repository and Docker context too. The current `.dockerignore` does not exclude arbitrary backup directories.

### Restore (destructive: confirm and back up first)

On a commit and PostgreSQL version compatible with the backup, privately create/configure `.env` for the target host. Do not overwrite existing credentials without a plan. Use a trusted backup and replace the example path:

```bash
set -e
BACKUP=/private/path/to/backup
docker compose stop bot web
docker compose up -d --wait db
docker compose exec -T db pg_restore -U doorman -d doorman \
  --clean --if-exists --no-owner --exit-on-error < "$BACKUP/database.dump"
# The DB restore overwrites data; the next command deletes all current banners.
docker compose run --rm --no-deps -T --entrypoint sh web \
  -c 'set -e; find /data/uploads -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar -xzf - -C /data/uploads' \
  < "$BACKUP/uploads.tar.gz"
docker compose rm -f schema
docker compose up -d --build --wait --wait-timeout 180
```

## 5. Updates

Back up first; review the release/diff and choose a reviewed commit/tag, without automatic updates. Run `git fetch` only when network access is authorized; `git checkout` requires a clean working tree and a real reference in place of the placeholder:

```bash
git fetch --tags origin
git checkout <reviewed-commit-or-tag>
docker compose stop bot web
docker compose rm -f schema
docker compose up -d --build --wait --wait-timeout 180
```

Removing only the `schema` container forces the check even if the image has not changed. **Never use `docker compose down -v` to update**: it deletes the DB and banners. If the schema changes incompatibly, reverting code alone is not enough: also restore the compatible DB/banner backup. Changing `POSTGRES_PASSWORD` in `.env` does not change the password of an existing database; it requires explicit, agreed SQL rotation and coordinated client updates.

### Volumes from the old root version

Before using the non-root version, back up. Existing banners may be owned by root; if uploads fail due to permissions, stop bot/web and authorize a fix limited to the volume:

```bash
docker compose stop bot web
docker compose run --rm --no-deps --user root --cap-add CHOWN \
  --entrypoint chown web -R 1000:1000 /data/uploads
docker compose up -d --build --wait --wait-timeout 180
```

This command is the temporary exception to non-root operation, not the permanent configuration. PostgreSQL keeps major version 16 and the previous data directory; if the DB volume has unusual ownership, request diagnosis before changing it.

## 6. Troubleshooting

- **Missing required variable:** privately fill in `.env` following `.env.example`; there is no default-password fallback. Compose ignores the host's `DATABASE_URL`/`UPLOADS_DIR` for services, deriving them from its own configuration.
- **DB unhealthy:** `docker compose logs --tail=80 db`; check disk space, permissions and the original volume password. Do not delete volumes to “repair” them.
- **Schema failed:** `docker compose logs --tail=80 schema`; check compatibility, back up and plan a manual migration if needed. Blocking bot/web in this case is intentional.
- **401/token or intent disallowed:** privately verify the correct token/app and Server Members Intent; recreate the bot after rotation. Changing intents or tokens in the portal requires consent.
- **OAuth redirect/login returns to the home page:** privately compare origin/port/scheme and the exact redirect; for HTTPS, check TLS/proxy/Secure cookies; the browser must be able to reach `PUBLIC_URL`. Do not collect cookies or OAuth codes in logs.
- **Server missing:** verify that the bot was invited to that exact server, is connected and that the user has Manage Server or is the owner. Permissions are reread from Discord on every page and change; if the OAuth token has expired, log in again.
- **Roles not assigned:** check Manage Roles, hierarchy and that the role is unmanaged/non-privileged. Denying a queued request does not kick/ban.
- **Card missing:** check a valid banner, a regular text channel, View/Send/Attach permissions and volume ownership. Approval grants configured roles; it does not promise retroactive card delivery.
- **Invite not recognized:** Manage Server is required. Vanity URLs, deleted/expired invites or simultaneous joins make attribution ambiguous; do not use it as proof of identity or a security boundary.
- **Build fails:** do not regenerate the lockfile during deployment; use a complete checkout, compatible Node/pnpm and sufficient disk space. See [local checks](infra-checks.md). The first build requires network access; the schema job requires a real DB.
