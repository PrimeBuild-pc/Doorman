import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PermissionFlagsBits,
  PermissionsBitField,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '@doorman/database';
import { commands } from './index.js';
import * as status from './status.js';
import { dictionaries, descriptionLocalizations } from '../lib/i18n.js';

vi.mock('@doorman/database', () => ({
  prisma: {
    guild: { findUnique: vi.fn() },
    pendingApproval: { findMany: vi.fn() },
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.guild.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.pendingApproval.findMany).mockResolvedValue([]);
});

for (const command of commands) {
  describe(command.data.name, () => {
    it.each([
      { guildId: null, memberPermissions: null },
      { guildId: 'guild', memberPermissions: null },
      { guildId: 'guild', memberPermissions: new PermissionsBitField(0n) },
    ])('refuses unauthorized runtime invocation without reading guild data', async (fields) => {
      const interaction = { ...fields, reply: vi.fn() };
      await command.execute(interaction as unknown as ChatInputCommandInteraction);
      expect(prisma.guild.findUnique).not.toHaveBeenCalled();
      expect(prisma.pendingApproval.findMany).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    });

    it.each([PermissionFlagsBits.ManageGuild, PermissionFlagsBits.Administrator])(
      'allows runtime guild managers (%s)',
      async (permission) => {
        const interaction = {
          guildId: 'guild',
          memberPermissions: new PermissionsBitField(permission),
          reply: vi.fn(),
        };
        await command.execute(interaction as unknown as ChatInputCommandInteraction);
        expect(interaction.reply).toHaveBeenCalled();
        expect(
          vi.mocked(prisma.guild.findUnique).mock.calls.length +
            vi.mocked(prisma.pendingApproval.findMany).mock.calls.length,
        ).toBe(1);
      },
    );

    it('preserves command names, permissions and DM restrictions while localizing descriptions', () => {
      const registration = command.data.toJSON();
      const key = command === status ? 'statusDescription' : 'pendingDescription';
      expect(registration.name).toBe(command === status ? 'doorman-status' : 'doorman-pending');
      expect(registration.dm_permission).toBe(false);
      expect(registration.default_member_permissions).toBe(String(PermissionFlagsBits.ManageGuild));
      expect(registration.name_localizations).toBeUndefined();
      expect(registration.options).toEqual([]);
      expect(registration.description).toBe(dictionaries.en[key]);
      expect(registration.description_localizations).toEqual(descriptionLocalizations(key));
    });
  });
}
