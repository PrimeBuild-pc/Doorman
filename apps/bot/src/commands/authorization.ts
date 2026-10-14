import { PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';

export async function requireGuildManager(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  // Discord supplies current permissions with the interaction; registration defaults can be overridden.
  if (interaction.guildId && interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
    return true;
  await interaction.reply({
    content: 'This command requires Manage Server in a server.',
    ephemeral: true,
  });
  return false;
}
