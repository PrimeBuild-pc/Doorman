import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { getEnv } from '@doorman/shared';
import { registerEvents } from './events/index.js';
import { commands } from './commands/index.js';

const env = getEnv();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
  ],
});

async function registerCommands(): Promise<void> {
  const rest = new REST().setToken(env.DISCORD_BOT_TOKEN);
  // Global registration (not per-guild): simpler for a self-hosted single-instance
  // bot, and the ~1h propagation delay only matters the very first time it runs.
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
    body: commands.map((c) => c.data.toJSON()),
  });
}

registerEvents(client, registerCommands);

// At boot the network/DNS may not be ready yet: retry transient errors instead of exiting,
// so a restart limit in Compose cannot leave the bot down. Bad tokens still exit at once.
const TRANSIENT = new Set(['EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT']);

async function login(attempt = 1): Promise<void> {
  try {
    await client.login(env.DISCORD_BOT_TOKEN);
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && TRANSIENT.has(code)) {
      const delay = Math.min(60_000, 5_000 * attempt);
      console.warn(`Discord unreachable (${code}); retrying in ${delay / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return login(attempt + 1);
    }
    console.error('Failed to log in to Discord — check DISCORD_BOT_TOKEN.', err);
    process.exit(1);
  }
}

void login();
