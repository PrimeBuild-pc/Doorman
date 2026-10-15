<p align="center">
  <img src="docs/assets/in-development.svg" alt="In development" width="420">
</p>

<p align="center">
  <img src="docs/assets/banner.svg" alt="Doorman — welcome and roles for Discord communities" width="100%">
</p>

<p align="center">
  <a href="https://github.com/PrimeBuild-pc/Doorman/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/PrimeBuild-pc/Doorman?style=plastic&amp;logo=git&amp;logoColor=white"></a>
  <a href="https://github.com/PrimeBuild-pc/Doorman/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/PrimeBuild-pc/Doorman?style=plastic&amp;logo=github"></a>
  <a href="https://github.com/PrimeBuild-pc/Doorman/issues"><img alt="Open issues" src="https://img.shields.io/github/issues/PrimeBuild-pc/Doorman?style=plastic&amp;logo=github"></a>
</p>

<p align="center">
  <a href="https://github.com/PrimeBuild-pc/Doorman/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/PrimeBuild-pc/Doorman/ci.yml?branch=main&amp;style=plastic&amp;logo=githubactions&amp;label=CI"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-2ea44f?style=plastic"></a>
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-your%20infrastructure-2dd4a7?style=plastic">
  <img alt="Privacy-first" src="https://img.shields.io/badge/privacy-first-2dd4a7?style=plastic">
</p>

<p align="center">
  <img alt="TypeScript strict" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=plastic&amp;logo=typescript&amp;logoColor=white">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-111111?style=plastic&amp;logo=nextdotjs&amp;logoColor=white">
  <img alt="discord.js v14" src="https://img.shields.io/badge/discord.js-v14-5865F2?style=plastic&amp;logo=discord&amp;logoColor=white">
</p>

<p align="center"><i>Welcome new members with roles, custom cards and approvals managed by your server.</i></p>

---

# Doorman

A self-hosted Discord bot for communities: autorole, welcome cards with banners, invite-based roles and an approval queue for accounts that are too new. A dashboard with Discord login; `/doorman-status` and `/doorman-pending` commands for users who can manage the server.

**In development:** the account-age filter is not complete anti-raid protection; invite attribution is best-effort. Do not automatically assign administrative roles.

## Getting started

You need Docker Engine/Desktop with Linux containers, a recent Compose v2, Bash and OpenSSL.

```bash
git clone --config core.autocrlf=false https://github.com/PrimeBuild-pc/Doorman.git
cd Doorman
bash install.sh
```

First prepare the Discord app using the [self-hosting guide](docs/self-hosting.md): intents, OAuth, minimum permissions and role hierarchy. The installer hides the token and Client Secret, generates random passwords, **does not overwrite `.env`** and asks for confirmation before downloading/starting services. The dashboard stays on `127.0.0.1:3000`; remote access requires HTTPS or an SSH tunnel.

After startup, open `http://localhost:3000`, log in with Discord, choose the server and save the roles/channel. For a remote homelab, use the guide's SSH tunnel before opening the browser.

## Interface languages

The dashboard and Discord interface support English (`en`), Italian (`it`), Spanish (`es`), Russian (`ru`) and Chinese (`zh`, Simplified Chinese text for all Chinese locales). The installer and operational documentation are English-only.

- Dashboard: choose **Language** and apply it. The choice is stored in the `doorman_locale` browser cookie for one year, including across logout. Without a valid choice, the browser's `Accept-Language` preferences select the highest-priority supported language; otherwise English is used. Regional variants share their base language. The page language, dates, labels, help and safe errors follow this choice.
- Discord: slash command descriptions follow the Discord client language; replies use the interaction's user locale (the guild locale only if the interaction locale is absent). Public welcomes and cards use the server's preferred locale. Unsupported or invalid Discord locales fall back to English. Command names stay unchanged; registration updates descriptions on the next normal bot startup.

Server/channel/role names, usernames, invite codes, uploaded images and other user content are never translated. Logs, developer errors and code comments remain English. Welcome cards need fonts covering the chosen language; the Docker image includes Latin/Cyrillic and CJK fonts.

## Multiple servers, one installation

Invite the same app to each desired server; roles, banners, invites and approvals are separated by server ID. Every settings access or change checks current Discord permissions and the bot's presence. Only non-privileged roles, including in channel overrides, below Doorman can be assigned. A Discord error is not recorded as a successful approval.

Requests from previous joins are superseded; simultaneous joins with ambiguous invites do not receive an invite-based role. This installation is for trusted communities, **not a public multi-tenant service** or proof of members' identities.

## Architecture and costs

`apps/bot` (discord.js) and `apps/web` (Next.js) share PostgreSQL (`packages/database`) and the banner volume. Compose runs a single schema job first, then the bot and web, as non-root users. The code is TypeScript in a pnpm monorepo.

The bot needs no AI model, LLM key or AI subscription. Any coding-agent subscriptions are separate development tools: they neither fund nor host Doorman. You still pay for your host, storage/backups, network and any domain. Discord receives API requests, messages and welcome images; the database and original banners reside on your host.

- [Installation, configuration, backups, updates and troubleshooting](docs/self-hosting.md)
- [Development and local checks](docs/development.md)
- [Infrastructure checks without deployment](docs/infra-checks.md)
- [Safe agent assistance](docs/agent-operations.md)

[MIT](LICENSE) license.
