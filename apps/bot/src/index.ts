import { Client, Events, GatewayIntentBits, type Guild } from 'discord.js';
import { prisma } from '@doorman/database';
import { getEnv } from '@doorman/shared';
import { warmInviteCache } from './lib/inviteCache.js';
import * as guildMemberAdd from './events/guildMemberAdd.js';

const env = getEnv();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildInvites],
});

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
});

client.on(Events.GuildCreate, ensureGuildRow);
client.on(guildMemberAdd.name, guildMemberAdd.execute);

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
