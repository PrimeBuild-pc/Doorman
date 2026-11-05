import { Events, PermissionFlagsBits, type Client, type Guild } from 'discord.js';
import { prisma } from '@doorman/database';
import { cacheCreatedInvite, clearInviteCache, warmInviteCache } from '../lib/inviteCache.js';
import * as guildMemberAdd from './guildMemberAdd.js';
import * as guildMemberRemove from './guildMemberRemove.js';
import { commands } from '../commands/index.js';
import { interactionLocale, t } from '../lib/i18n.js';

const WELCOME_PERMISSIONS = {
  ViewChannel: PermissionFlagsBits.ViewChannel,
  SendMessages: PermissionFlagsBits.SendMessages,
  AttachFiles: PermissionFlagsBits.AttachFiles,
  EmbedLinks: PermissionFlagsBits.EmbedLinks,
};

/** Logs which permissions the bot lacks in the configured welcome channel, if any. */
export async function checkWelcomeChannel(guild: Guild, channelId: string | null): Promise<void> {
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  const me = await guild.members.fetchMe();
  const perms = channel ? me.permissionsIn(channel) : null;
  const missing = perms
    ? Object.entries(WELCOME_PERMISSIONS).flatMap(([name, bit]) => (perms.has(bit) ? [] : [name]))
    : ['channel not found'];
  if (missing.length > 0) {
    console.warn(
      `Welcome channel ${channelId} in guild ${guild.id}: missing ${missing.join(', ')}`,
    );
  } else {
    console.log(`Welcome channel ${channelId} in guild ${guild.id}: ok`);
  }
}

async function ensureGuildRow(guild: Guild): Promise<void> {
  if (!guild.available) return;
  const row = await prisma.guild.upsert({
    where: { id: guild.id },
    update: { name: guild.name },
    create: { id: guild.id, name: guild.name },
  });
  await warmInviteCache(guild);
  await checkWelcomeChannel(guild, row?.welcomeChannelId ?? null);
}

export function registerEvents(client: Client, registerCommands: () => Promise<void>): void {
  const initializeGuild = (guild: Guild) =>
    ensureGuildRow(guild).catch((err: unknown) => {
      console.error(`Could not initialize guild ${guild.id}`, err);
    });

  client.once(Events.ClientReady, async (ready) => {
    console.log(`Doorman logged in as ${ready.user.tag}`);
    for (const guild of ready.guilds.cache.values()) await initializeGuild(guild);
    await registerCommands().catch((err: unknown) =>
      console.error('Could not register slash commands', err),
    );
  });
  client.on(Events.GuildCreate, initializeGuild);
  client.on(Events.GuildAvailable, initializeGuild);
  // Keep persisted configuration on removal/outage; a rejoin must start with a fresh snapshot.
  client.on(Events.GuildDelete, (guild) => clearInviteCache(guild.id));
  client.on(Events.GuildUnavailable, (guild) => clearInviteCache(guild.id));
  client.on(Events.Error, (err) => console.error('Discord client error', err));
  client.on(guildMemberRemove.name, (member) =>
    guildMemberRemove.execute(member).catch((err: unknown) => {
      console.warn(`Goodbye failed in guild ${member.guild.id} for member ${member.id}`, err);
    }),
  );
  client.on(guildMemberAdd.name, (member) =>
    guildMemberAdd.execute(member).catch((err: unknown) => {
      console.error(`Member join failed in guild ${member.guild.id} for member ${member.id}`, err);
    }),
  );

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = commands.find((entry) => entry.data.name === interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Command ${interaction.commandName} failed`, err);
      try {
        const content = t(interactionLocale(interaction), 'commandError');
        if (interaction.deferred && !interaction.replied) {
          await interaction.editReply({ content });
        } else if (interaction.replied) {
          await interaction.followUp({ content, ephemeral: true });
        } else {
          await interaction.reply({ content, ephemeral: true });
        }
      } catch (replyError) {
        console.error('Could not report command failure', replyError);
      }
    }
  });

  // Do not re-fetch all counters on invite events: that would erase pending join deltas.
  client.on(Events.InviteCreate, (invite) => {
    if (!invite.guild) return;
    return cacheCreatedInvite(invite.guild.id, invite.code, invite.uses).catch((err: unknown) => {
      console.error(`Could not cache new invite in guild ${invite.guild!.id}`, err);
    });
  });
}
