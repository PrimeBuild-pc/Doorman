import { describe, expect, it } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { dictionaries, descriptionLocalizations, interactionLocale, t } from './i18n.js';

describe('bot dictionaries', () => {
  it('has every English key and the same placeholders in every translation', () => {
    expect(Object.keys(dictionaries).sort()).toEqual(['en', 'es', 'it', 'ru', 'zh']);
    for (const dictionary of Object.values(dictionaries)) {
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(dictionaries.en).sort());
      for (const key of Object.keys(dictionaries.en) as Array<keyof typeof dictionaries.en>) {
        expect(dictionary[key].trim().length, key).toBeGreaterThan(0);
        expect(dictionary[key].match(/\{\w+\}/g) ?? [], key).toEqual(
          dictionaries.en[key].match(/\{\w+\}/g) ?? [],
        );
      }
    }
  });

  it('interpolates without translating or recursively replacing user content', () => {
    expect(
      t('en', 'pendingMember', {
        username: 'Alice {timestamp} $& 中文',
        timestamp: '<t:123:R>',
      }),
    ).toBe('• **Alice {timestamp} $& 中文** — account created <t:123:R>');
  });

  it.each(['statusDescription', 'pendingDescription'] as const)(
    'registers %s only for the requested Discord-supported tags',
    (key) => {
      const descriptions = descriptionLocalizations(key);
      expect(Object.keys(descriptions).sort()).toEqual([
        'en-GB',
        'en-US',
        'es-419',
        'es-ES',
        'it',
        'ru',
        'zh-CN',
        'zh-TW',
      ]);
      for (const description of Object.values(descriptions)) {
        expect(description!.length).toBeGreaterThan(0);
        expect(description!.length).toBeLessThanOrEqual(100);
      }
      expect(descriptions['en-US']).toBe(dictionaries.en[key]);
      expect(descriptions['en-GB']).toBe(dictionaries.en[key]);
      expect(descriptions.it).toBe(dictionaries.it[key]);
      expect(descriptions['es-ES']).toBe(dictionaries.es[key]);
      expect(descriptions['es-419']).toBe(dictionaries.es[key]);
      expect(descriptions.ru).toBe(dictionaries.ru[key]);
      expect(descriptions['zh-CN']).toBe(dictionaries.zh[key]);
      expect(descriptions['zh-TW']).toBe(dictionaries.zh[key]);
    },
  );
});

describe('interaction locale precedence', () => {
  it.each([
    { locale: 'it', guildLocale: 'ru', expected: 'it' },
    { locale: 'en-GB', guildLocale: 'ru', expected: 'en' },
    { locale: 'es-ES', guildLocale: 'ru', expected: 'es' },
    { locale: 'es-419', guildLocale: 'ru', expected: 'es' },
    { locale: 'ru', guildLocale: 'it', expected: 'ru' },
    { locale: 'zh-CN', guildLocale: 'it', expected: 'zh' },
    { locale: 'zh-TW', guildLocale: 'it', expected: 'zh' },
    { locale: undefined, guildLocale: 'it', expected: 'it' },
    { locale: null, guildLocale: 'ru', expected: 'ru' },
    { locale: undefined, guildLocale: undefined, expected: 'en' },
    { locale: 'invalid', guildLocale: 'it', expected: 'en' },
    { locale: '', guildLocale: 'it', expected: 'en' },
  ])('resolves $locale / $guildLocale to $expected', ({ expected, ...interaction }) => {
    expect(interactionLocale(interaction as unknown as ChatInputCommandInteraction)).toBe(expected);
  });
});
