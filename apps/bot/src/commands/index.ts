import type { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import * as status from './status.js';
import * as pending from './pending.js';

interface Command {
  data: SlashCommandBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export const commands: Command[] = [status, pending];
