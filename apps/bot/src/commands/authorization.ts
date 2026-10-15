import { PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import { interactionLocale, t } from '../lib/i18n.js';

export async function requireGuildManager(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  // Discord supplies current permissions with the interaction; registration defaults can be overridden.
  if (interaction.guildId && interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
    return true;
  await interaction.reply({
    content: t(interactionLocale(interaction), 'managerRequired'),
    ephemeral: true,
  });
  return false;
}
