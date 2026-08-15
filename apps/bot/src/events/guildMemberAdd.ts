import path from 'node:path';
import { Events, type GuildMember } from 'discord.js';
import { prisma } from '@doorman/database';
import { accountAgeHours, getEnv } from '@doorman/shared';
import { resolveUsedInviteCode } from '../lib/inviteCache.js';
import { renderWelcomeCard } from '../lib/welcomeCard.js';

export const name = Events.GuildMemberAdd;

export async function execute(member: GuildMember): Promise<void> {
  const guildConfig = await prisma.guild.findUnique({ where: { id: member.guild.id } });
  if (!guildConfig) return; // never configured from the dashboard — do nothing

  const ageHours = accountAgeHours(member.id);
  if (guildConfig.minAccountAgeHours > 0 && ageHours < guildConfig.minAccountAgeHours) {
    await prisma.pendingApproval.create({
      data: {
        guildId: member.guild.id,
        userId: member.id,
        username: member.user.username,
        accountCreatedAt: new Date(member.user.createdTimestamp),
        joinedAt: new Date(),
      },
    });
    return; // no auto-role, no welcome card until an admin approves from the dashboard
  }

  const rolesToAssign = new Set(guildConfig.defaultRoleIds);

  const inviteCode = await resolveUsedInviteCode(member.guild);
  if (inviteCode) {
    const mapping = await prisma.inviteRoleMap.findUnique({
      where: { guildId_inviteCode: { guildId: member.guild.id, inviteCode } },
    });
    if (mapping) rolesToAssign.add(mapping.roleId);
  }

  for (const roleId of rolesToAssign) {
    try {
      await member.roles.add(roleId);
    } catch {
      // Role deleted, or Doorman's own role sits below it in the hierarchy —
      // skip that one role rather than aborting the rest of the join handling.
    }
  }

  let welcomeSent = false;
  if (guildConfig.welcomeChannelId && guildConfig.bannerPath) {
    try {
      const channel = await member.guild.channels.fetch(guildConfig.welcomeChannelId);
      if (channel?.isTextBased()) {
        const bannerFile = path.join(getEnv().UPLOADS_DIR, guildConfig.bannerPath);
        const card = await renderWelcomeCard(
          bannerFile,
          member.user.displayAvatarURL({ extension: 'png', size: 256 }),
          member.user.username,
        );
        await channel.send({
          content: `Welcome <@${member.id}>!`,
          files: [{ attachment: card, name: 'welcome.png' }],
        });
        welcomeSent = true;
      }
    } catch {
      // Channel deleted or missing send permission — don't fail the join over it.
    }
  }

  await prisma.joinEvent.create({
    data: {
      guildId: member.guild.id,
      userId: member.id,
      inviteCodeUsed: inviteCode,
      rolesAssigned: Array.from(rolesToAssign),
      welcomeSent,
    },
  });
}
