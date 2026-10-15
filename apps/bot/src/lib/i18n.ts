import {
  botMessages as dictionaries,
  formatMessage,
  resolveLocale,
  type Locale,
} from '@doorman/shared';
import type { ChatInputCommandInteraction, LocalizationMap } from 'discord.js';

export { dictionaries };

export function interactionLocale(
  interaction: Pick<ChatInputCommandInteraction, 'locale' | 'guildLocale'>,
): Locale {
  return resolveLocale(interaction.locale ?? interaction.guildLocale);
}

export function t(
  locale: Locale,
  key: keyof typeof dictionaries.en,
  values?: Record<string, string | number>,
): string {
  return formatMessage(dictionaries[locale][key], values);
}

export function descriptionLocalizations(
  key: 'statusDescription' | 'pendingDescription',
): LocalizationMap {
  return {
    'en-US': dictionaries.en[key],
    'en-GB': dictionaries.en[key],
    it: dictionaries.it[key],
    'es-ES': dictionaries.es[key],
    'es-419': dictionaries.es[key],
    ru: dictionaries.ru[key],
    'zh-CN': dictionaries.zh[key],
    'zh-TW': dictionaries.zh[key],
  };
}
