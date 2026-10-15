import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '@doorman/database';
import { requireGuildManager } from './authorization.js';
import { descriptionLocalizations, interactionLocale, t } from '../lib/i18n.js';

const MAX_LISTED = 10;

export const data = new SlashCommandBuilder()
  .setName('doorman-pending')
  .setDescription(t('en', 'pendingDescription'))
  .setDescriptionLocalizations(descriptionLocalizations('pendingDescription'))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await requireGuildManager(interaction)) || !interaction.guildId) return;

  const locale = interactionLocale(interaction);
  const pending = await prisma.pendingApproval.findMany({
    where: { guildId: interaction.guildId, status: 'pending' },
    orderBy: { joinedAt: 'desc' },
    take: MAX_LISTED,
  });

  if (pending.length === 0) {
    await interaction.reply({ content: t(locale, 'nobodyPending'), ephemeral: true });
    return;
  }

  const lines = pending.map((p) =>
    t(locale, 'pendingMember', {
      username: p.username,
      timestamp: `<t:${Math.floor(p.accountCreatedAt.getTime() / 1000)}:R>`,
    }),
  );

  await interaction.reply({
    ephemeral: true,
    content: `${t(locale, 'pendingHeading')}\n${lines.join('\n')}`,
  });
}
