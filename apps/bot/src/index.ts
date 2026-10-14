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

client.login(env.DISCORD_BOT_TOKEN).catch((err: unknown) => {
  console.error('Failed to log in to Discord — check DISCORD_BOT_TOKEN.', err);
  process.exit(1);
});
