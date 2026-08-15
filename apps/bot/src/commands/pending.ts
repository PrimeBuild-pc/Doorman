import { PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '@doorman/database';

const MAX_LISTED = 10;

export const data = new SlashCommandBuilder()
  .setName('doorman-pending')
  .setDescription('List members held by the anti-raid guard, waiting for approval.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) return;

  const pending = await prisma.pendingApproval.findMany({
    where: { guildId: interaction.guildId, status: 'pending' },
    orderBy: { joinedAt: 'desc' },
    take: MAX_LISTED,
  });

  if (pending.length === 0) {
    await interaction.reply({ content: 'Nobody waiting on approval.', ephemeral: true });
    return;
  }

  const lines = pending.map(
    (p) => `• **${p.username}** — account created <t:${Math.floor(p.accountCreatedAt.getTime() / 1000)}:R>`,
  );

  await interaction.reply({
    ephemeral: true,
    content: `**Pending approvals** (approve/deny from the dashboard)\n${lines.join('\n')}`,
  });
}
