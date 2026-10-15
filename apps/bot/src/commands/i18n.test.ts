import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PermissionFlagsBits,
  PermissionsBitField,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '@doorman/database';
import { commands } from './index.js';
import * as status from './status.js';
import * as pending from './pending.js';
import { dictionaries, t } from '../lib/i18n.js';

vi.mock('@doorman/database', () => ({
  prisma: {
    guild: { findUnique: vi.fn() },
    pendingApproval: { findMany: vi.fn() },
  },
}));

beforeEach(() => vi.resetAllMocks());

const locales = ['en', 'it', 'es', 'ru', 'zh'] as const;

function interactionFixture(locale?: string, guildLocale = 'en-US') {
  const reply = vi.fn();
  const interaction = {
    locale,
    guildLocale,
    guildId: 'guild',
    memberPermissions: new PermissionsBitField(PermissionFlagsBits.ManageGuild),
    reply,
  };
  return { interaction, reply, typed: interaction as unknown as ChatInputCommandInteraction };
}

for (const locale of locales) {
  describe(`localized commands (${locale})`, () => {
    for (const command of commands) {
      it(`${command.data.name} localizes authorization denial without querying data`, async () => {
        const { interaction, reply, typed } = interactionFixture(locale, 'it');
        interaction.memberPermissions = new PermissionsBitField(0n);
        await command.execute(typed);
        expect(reply).toHaveBeenCalledWith({
          content: dictionaries[locale].managerRequired,
          ephemeral: true,
        });
        expect(prisma.guild.findUnique).not.toHaveBeenCalled();
        expect(prisma.pendingApproval.findMany).not.toHaveBeenCalled();
      });
    }

    it('localizes the unconfigured status', async () => {
      vi.mocked(prisma.guild.findUnique).mockResolvedValue(null);
      const { typed, reply } = interactionFixture(locale);
      await status.execute(typed);
      expect(reply).toHaveBeenCalledWith({
        content: dictionaries[locale].notConfigured,
        ephemeral: true,
      });
      expect(prisma.guild.findUnique).toHaveBeenCalledWith({ where: { id: 'guild' } });
    });

    it.each([false, true])(
      'localizes all status fields (configured values: %s)',
      async (configured) => {
        vi.mocked(prisma.guild.findUnique).mockResolvedValue({
          defaultRoleIds: configured ? ['role1', 'role2'] : [],
          welcomeChannelId: configured ? 'channel' : null,
          bannerPath: configured ? 'banner.png' : null,
          minAccountAgeHours: configured ? 24 : 0,
        } as never);
        const { typed, reply } = interactionFixture(locale);
        await status.execute(typed);
        expect(reply).toHaveBeenCalledWith({
          ephemeral: true,
          content: [
            dictionaries[locale].configuration,
            t(locale, 'defaultRoles', {
              roles: configured ? '<@&role1>, <@&role2>' : dictionaries[locale].none,
            }),
            t(locale, 'welcomeChannel', {
              channel: configured ? '<#channel>' : dictionaries[locale].none,
            }),
            t(locale, 'welcomeBanner', {
              banner: configured
                ? dictionaries[locale].bannerSet
                : dictionaries[locale].bannerNotSet,
            }),
            t(locale, 'antiRaid', {
              guard: configured ? t(locale, 'accountAge', { hours: 24 }) : dictionaries[locale].off,
            }),
          ].join('\n'),
        });
      },
    );

    it('localizes the empty approval queue and preserves the bounded, guild-scoped query', async () => {
      vi.mocked(prisma.pendingApproval.findMany).mockResolvedValue([]);
      const { typed, reply } = interactionFixture(locale);
      await pending.execute(typed);
      expect(reply).toHaveBeenCalledWith({
        content: dictionaries[locale].nobodyPending,
        ephemeral: true,
      });
      expect(prisma.pendingApproval.findMany).toHaveBeenCalledWith({
        where: { guildId: 'guild', status: 'pending' },
        orderBy: { joinedAt: 'desc' },
        take: 10,
      });
    });

    it('localizes a populated approval queue without changing usernames or Discord timestamps', async () => {
      const username = 'Alice {timestamp} $& 中文';
      vi.mocked(prisma.pendingApproval.findMany).mockResolvedValue([
        { username, accountCreatedAt: new Date('2026-01-01T00:00:00.000Z') },
        { username: 'Bob', accountCreatedAt: new Date('2025-01-01T00:00:00.000Z') },
      ] as never);
      const { typed, reply } = interactionFixture(locale);
      await pending.execute(typed);
      expect(reply).toHaveBeenCalledWith({
        ephemeral: true,
        content: `${dictionaries[locale].pendingHeading}\n${t(locale, 'pendingMember', {
          username,
          timestamp: '<t:1767225600:R>',
        })}\n${t(locale, 'pendingMember', { username: 'Bob', timestamp: '<t:1735689600:R>' })}`,
      });
      expect(reply.mock.calls[0][0].content).toContain(username);
    });
  });
}

it.each([
  { locale: undefined, guildLocale: 'ru', expected: 'ru' },
  { locale: undefined, guildLocale: 'invalid', expected: 'en' },
  { locale: 'invalid', guildLocale: 'it', expected: 'en' },
  { locale: 'en-GB', guildLocale: 'it', expected: 'en' },
  { locale: 'es-419', guildLocale: 'it', expected: 'es' },
  { locale: 'zh-TW', guildLocale: 'it', expected: 'zh' },
] as const)(
  'command execution uses locale precedence: $locale / $guildLocale',
  async ({ locale, guildLocale, expected }) => {
    vi.mocked(prisma.guild.findUnique).mockResolvedValue(null);
    const { typed, reply } = interactionFixture(locale, guildLocale);
    await status.execute(typed);
    expect(reply).toHaveBeenCalledWith({
      content: dictionaries[expected].notConfigured,
      ephemeral: true,
    });
  },
);
