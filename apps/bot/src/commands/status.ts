import { PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '@doorman/database';

export const data = new SlashCommandBuilder()
  .setName('doorman-status')
  .setDescription("Show Doorman's current configuration for this server.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) return;

  const guildConfig = await prisma.guild.findUnique({ where: { id: interaction.guildId } });
  if (!guildConfig) {
    await interaction.reply({ content: 'Not configured yet — open the dashboard first.', ephemeral: true });
    return;
  }

  const roles = guildConfig.defaultRoleIds.length
    ? guildConfig.defaultRoleIds.map((id) => `<@&${id}>`).join(', ')
    : '— none —';
  const welcomeChannel = guildConfig.welcomeChannelId ? `<#${guildConfig.welcomeChannelId}>` : '— none —';
  const antiRaid =
    guildConfig.minAccountAgeHours > 0 ? `${guildConfig.minAccountAgeHours}h minimum account age` : 'off';
  const banner = guildConfig.bannerPath ? 'set' : 'not set';

  await interaction.reply({
    ephemeral: true,
    content: [
      '**Doorman configuration**',
      `Default role(s): ${roles}`,
      `Welcome channel: ${welcomeChannel}`,
      `Welcome banner: ${banner}`,
      `Anti-raid guard: ${antiRaid}`,
    ].join('\n'),
  });
}
