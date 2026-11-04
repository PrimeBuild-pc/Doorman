import path from 'node:path';
import { EmbedBuilder, Events, PermissionFlagsBits, type GuildMember } from 'discord.js';
import { prisma } from '@doorman/database';
import { accountAgeHours, getEnv, isSafeAutoRole } from '@doorman/shared';
import { resolveUsedInviteCode } from '../lib/inviteCache.js';
import { renderWelcomeCard } from '../lib/welcomeCard.js';
import { pickWelcomePhrase } from '../lib/welcomePhrases.js';

export const name = Events.GuildMemberAdd;

export async function execute(member: GuildMember): Promise<void> {
  // Consume the snapshot even when this member is held or the guild is unconfigured.
  const inviteCode = await resolveUsedInviteCode(member.guild);
  const guildConfig = await prisma.guild.findUnique({ where: { id: member.guild.id } });
  if (!guildConfig) return; // never configured from the dashboard — do nothing

  const ageHours = accountAgeHours(member.id);
  if (guildConfig.minAccountAgeHours > 0 && ageHours < guildConfig.minAccountAgeHours) {
    const joinedAt = member.joinedAt;
    if (!joinedAt) throw new Error('Discord member join timestamp is missing');
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${member.guild.id + ':' + member.id}, 0))`;
      await tx.pendingApproval.updateMany({
        where: { guildId: member.guild.id, userId: member.id, status: 'pending' },
        data: { status: 'superseded' },
      });
      await tx.pendingApproval.create({
        data: {
          guildId: member.guild.id,
          userId: member.id,
          username: member.user.username,
          accountCreatedAt: new Date(member.user.createdTimestamp),
          joinedAt,
        },
      });
    });
    return; // no auto-role, no welcome card until an admin approves from the dashboard
  }

  const rolesToAssign = new Set(guildConfig.defaultRoleIds);

  if (inviteCode) {
    const mapping = await prisma.inviteRoleMap.findUnique({
      where: { guildId_inviteCode: { guildId: member.guild.id, inviteCode } },
    });
    if (mapping) rolesToAssign.add(mapping.roleId);
  }

  const rolesAssigned: string[] = [];
  if (rolesToAssign.size > 0) {
    try {
      const [roles, bot, channels] = await Promise.all([
        member.guild.roles.fetch(),
        member.guild.members.fetchMe({ force: true }),
        member.guild.channels.fetch(),
      ]);
      const overwrites = [...channels.values()].flatMap((channel) =>
        channel
          ? [...channel.permissionOverwrites.cache.values()].map((overwrite) => ({
              id: overwrite.id,
              allow: overwrite.allow.bitfield,
            }))
          : [],
      );
      for (const roleId of rolesToAssign) {
        const role = roles.get(roleId);
        if (
          !role ||
          !isSafeAutoRole(
            { id: role.id, managed: role.managed, permissions: role.permissions.bitfield },
            member.guild.id,
            overwrites,
          ) ||
          !bot.permissions.has(PermissionFlagsBits.ManageRoles) ||
          bot.roles.highest.comparePositionTo(role) <= 0
        ) {
          console.warn(`Skipped unsafe or unassignable role ${roleId} in guild ${member.guild.id}`);
          continue;
        }
        try {
          await member.roles.add(roleId);
          rolesAssigned.push(roleId);
        } catch (err) {
          console.warn(
            `Could not assign role ${roleId} to member ${member.id} in guild ${member.guild.id}`,
            err,
          );
        }
      }
    } catch (err) {
      console.warn(`Could not validate automatic roles in guild ${member.guild.id}`, err);
    }
  }

  let welcomeSent = false;
  if (guildConfig.welcomeChannelId) {
    try {
      const channel = await member.guild.channels.fetch(guildConfig.welcomeChannelId);
      if (channel?.isTextBased() && channel.guildId === member.guild.id) {
        const bannerPath = guildConfig.bannerPath;
        if (
          bannerPath &&
          (bannerPath === '.' ||
            bannerPath === '..' ||
            path.posix.basename(bannerPath) !== bannerPath ||
            path.win32.basename(bannerPath) !== bannerPath)
        ) {
          throw new Error('Banner path must be a filename within UPLOADS_DIR');
        }
        // No uploaded banner: the card falls back to the built-in PrimeBuild background.
        const bannerFile = bannerPath ? path.join(getEnv().UPLOADS_DIR, bannerPath) : null;
        const card = await renderWelcomeCard(
          bannerFile,
          member.user.displayAvatarURL({ extension: 'png', size: 256 }),
          member.displayName,
          member.guild.name,
          member.guild.memberCount,
        );
        const mention = `<@${member.id}>`;
        await channel.send({
          content: mention,
          embeds: [
            new EmbedBuilder()
              .setColor(0xff6600)
              .setDescription(pickWelcomePhrase(mention, member.guild.name))
              .setImage('attachment://welcome.png'),
          ],
          files: [{ attachment: card, name: 'welcome.png' }],
          allowedMentions: { users: [member.id] },
        });
        welcomeSent = true;
      }
    } catch (err) {
      console.warn(
        `Could not send welcome for member ${member.id} in guild ${member.guild.id}`,
        err,
      );
    }
  }

  await prisma.joinEvent.create({
    data: {
      guildId: member.guild.id,
      userId: member.id,
      inviteCodeUsed: inviteCode,
      rolesAssigned,
      welcomeSent,
    },
  });
}
