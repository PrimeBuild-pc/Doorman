# Agent-assisted installation and operations

## Authorization contract

The agent assists the person using the authorized host's shell or a browser **already authenticated by the user**. No new API, dedicated MCP server, agent token or Discord service account is needed. If tools are unavailable, provide instructions for manual execution.

1. Identify the host, checkout, Discord server (name and ID), test/production environment and goal. Read the relevant section of the [self-hosting guide](self-hosting.md). This step is complete when the target and requested outcome are unambiguous.
2. Propose the exact actions, identifying network access, downtime, HTTP exposure, Discord/data changes and reversibility. For updates/restores, confirm with the user that a compatible backup exists without opening it.
3. Ask for explicit confirmation for those actions on that target; a generic request to “fix the project” does not authorize deployment or changes to a real server. If the scope, target or destructive action changes, stop and ask again.
4. Perform only the approved action, in the authorized browser or agreed shell. Recheck the server/host immediately before submitting a change. Confirm the observable result without exporting sensitive data.
5. Report what changed, checks, downtime and remaining issues. A healthy HTTP process does not prove that the bot is connected or has the correct permissions.

## Boundaries by phase

- **Local preparation:** inspecting source files, `.env.example`, shell syntax and [checks with fake credentials](infra-checks.md) requires no secrets or Discord connection. Network access (clone/fetch/install/download) and real services require specific consent.
- **Installation:** the user creates the app in the portal and privately enters the token/Client Secret in the installer. Do not control the terminal while it displays secret fields or record the form. Saving configuration and subsequent startup are two separate effects: describe them beforehand; `START` is the installer's confirmation, not a substitute for consent to the scope of the agent's work.
- **Browser:** the user completes login/2FA. Use the normal interface without reading DevTools/storage/cookies or intercepting OAuth. Inviting the bot, changing permissions/intents, resetting tokens, saving settings and approving/denying members are real actions: obtain consent for the exact server and members/roles. Avoid screenshots with secrets or unnecessary personal data.
- **Diagnosis:** prefer `docker compose ps -a` and `docker compose config --quiet`. Logs may include personal data/credentials: ask the user for redacted excerpts or agree on local collection with minimization and redaction before reporting them.
- **Backup:** authorize the private destination and downtime; commands copy `.env` as an opaque file, but the agent does not read its contents. Do not open dumps/banners to “check” them, send them to third-party services or include them in the checkout/build.
- **Update/restore:** obtain explicit consent for the commit and DB operations. Restores, removing volumes or banners, credential rotation, bind/network changes and ownership fixes require dedicated confirmation. Do not automatically accept Prisma data loss. Never use `down -v` as an update.

## Secrets and costs

Do not read the actual `.env`, even through `source`, `grep`, `docker inspect`, expanded `docker compose config` or environment dumps. Do not ask for tokens/cookies/passwords in chat. For missing configuration, name the variable and let the user enter it privately; for sensitive logs, request redaction.

A coding-agent subscription covers its use as a tool, not the Doorman runtime. A chat subscription does not imply API credits: APIs used by the agent may have separate billing depending on the provider/plan. The bot does not use AI or require LLM keys; the host, backups and domain remain the user's responsibility. Do not introduce AI integrations to “automate” administration or approvals.
