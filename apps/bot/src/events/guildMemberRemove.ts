import { Events, type GuildMember, type PartialGuildMember } from 'discord.js';
import { prisma } from '@doorman/database';
import { pickMessage } from '@doorman/shared';

export const name = Events.GuildMemberRemove;

/** Posts a plain-text goodbye (no embed, no ping) when a member leaves. */
export async function execute(member: GuildMember | PartialGuildMember): Promise<void> {
  const guildConfig = await prisma.guild.findUnique({ where: { id: member.guild.id } });
  const channelId = guildConfig?.goodbyeChannelId ?? guildConfig?.welcomeChannelId;
  if (!guildConfig?.goodbyeEnabled || !channelId) return;

  const channel = await member.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || channel.guildId !== member.guild.id) return;

  const username = member.user?.globalName ?? member.user?.username ?? member.displayName;
  const content = pickMessage('goodbye', guildConfig.goodbyeMessage, guildConfig.messageLocale, {
    user: username,
    username,
    server: member.guild.name,
    memberCount: member.guild.memberCount,
  });
  await channel.send({ content, allowedMentions: { parse: [] } });
}
