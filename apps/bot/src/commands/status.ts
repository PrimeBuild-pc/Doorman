import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '@doorman/database';
import { requireGuildManager } from './authorization.js';
import { descriptionLocalizations, interactionLocale, t } from '../lib/i18n.js';

export const data = new SlashCommandBuilder()
  .setName('doorman-status')
  .setDescription(t('en', 'statusDescription'))
  .setDescriptionLocalizations(descriptionLocalizations('statusDescription'))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await requireGuildManager(interaction)) || !interaction.guildId) return;

  const locale = interactionLocale(interaction);
  const guildConfig = await prisma.guild.findUnique({ where: { id: interaction.guildId } });
  if (!guildConfig) {
    await interaction.reply({
      content: t(locale, 'notConfigured'),
      ephemeral: true,
    });
    return;
  }

  const roles = guildConfig.defaultRoleIds.length
    ? guildConfig.defaultRoleIds.map((id) => `<@&${id}>`).join(', ')
    : t(locale, 'none');
  const welcomeChannel = guildConfig.welcomeChannelId
    ? `<#${guildConfig.welcomeChannelId}>`
    : t(locale, 'none');
  const antiRaid =
    guildConfig.minAccountAgeHours > 0
      ? t(locale, 'accountAge', { hours: guildConfig.minAccountAgeHours })
      : t(locale, 'off');
  const banner = t(locale, guildConfig.bannerPath ? 'bannerSet' : 'bannerNotSet');

  await interaction.reply({
    ephemeral: true,
    content: [
      t(locale, 'configuration'),
      t(locale, 'defaultRoles', { roles }),
      t(locale, 'welcomeChannel', { channel: welcomeChannel }),
      t(locale, 'welcomeBanner', { banner }),
      t(locale, 'antiRaid', { guard: antiRaid }),
    ].join('\n'),
  });
}
