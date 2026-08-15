import { Client, Events, GatewayIntentBits, REST, Routes, type Guild } from 'discord.js';
import { prisma } from '@doorman/database';
import { getEnv } from '@doorman/shared';
import { warmInviteCache } from './lib/inviteCache.js';
import * as guildMemberAdd from './events/guildMemberAdd.js';
import { commands } from './commands/index.js';

const env = getEnv();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildInvites],
});

async function registerCommands(): Promise<void> {
  const rest = new REST().setToken(env.DISCORD_BOT_TOKEN);
  // Global registration (not per-guild): simpler for a self-hosted single-instance
  // bot, and the ~1h propagation delay only matters the very first time it runs.
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
    body: commands.map((c) => c.data.toJSON()),
  });
}

async function ensureGuildRow(guild: Guild): Promise<void> {
  await prisma.guild.upsert({
    where: { id: guild.id },
    update: { name: guild.name },
    create: { id: guild.id, name: guild.name },
  });
  await warmInviteCache(guild);
}

client.once(Events.ClientReady, async (ready) => {
  console.log(`Doorman logged in as ${ready.user.tag}`);
  for (const guild of ready.guilds.cache.values()) {
    await ensureGuildRow(guild);
  }
  await registerCommands();
});

client.on(Events.GuildCreate, ensureGuildRow);
client.on(guildMemberAdd.name, guildMemberAdd.execute);

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commands.find((c) => c.data.name === interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Command ${interaction.commandName} failed`, err);
    if (!interaction.replied) {
      await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
    }
  }
});

client.on(Events.InviteCreate, (invite) => {
  if (invite.guild) void warmInviteCache(invite.guild as Guild);
});
client.on(Events.InviteDelete, (invite) => {
  if (invite.guild) void warmInviteCache(invite.guild as Guild);
});

client.login(env.DISCORD_BOT_TOKEN).catch((err: unknown) => {
  console.error('Failed to log in to Discord — check DISCORD_BOT_TOKEN.', err);
  process.exit(1);
});
