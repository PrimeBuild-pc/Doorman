import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuildMember } from 'discord.js';
import { prisma } from '@doorman/database';
import { execute } from './guildMemberRemove.js';

vi.mock('@doorman/database', () => ({ prisma: { guild: { findUnique: vi.fn() } } }));

function fixture(channelGuild = 'guild') {
  const channel = { guildId: channelGuild, isTextBased: () => true, send: vi.fn() };
  const member = {
    id: '42',
    displayName: 'nick',
    user: { username: 'leaver', globalName: 'Leaver' },
    guild: {
      id: 'guild',
      name: 'PrimeBuild',
      memberCount: 168,
      channels: { fetch: vi.fn().mockResolvedValue(channel) },
    },
  };
  return { member: member as unknown as GuildMember, channel, fetch: member.guild.channels.fetch };
}

const config = (overrides: Record<string, unknown> = {}) =>
  ({
    welcomeChannelId: 'welcome',
    goodbyeChannelId: null,
    goodbyeEnabled: true,
    goodbyeMessage: null,
    messageLocale: 'en',
    ...overrides,
  }) as never;

beforeEach(() => vi.resetAllMocks());

describe('member leave', () => {
  it('posts a plain-text default goodbye in the welcome channel without pinging anyone', async () => {
    const { member, channel, fetch } = fixture();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.mocked(prisma.guild.findUnique).mockResolvedValue(config());
    await execute(member);
    expect(fetch).toHaveBeenCalledWith('welcome');
    expect(channel.send).toHaveBeenCalledWith({
      content: 'Leaver has left the server. Safe travels! 👋',
      allowedMentions: { parse: [] },
    });
  });

  it('uses the custom text and goodbye channel', async () => {
    const { member, channel, fetch } = fixture();
    vi.mocked(prisma.guild.findUnique).mockResolvedValue(
      config({
        goodbyeChannelId: 'bye',
        goodbyeMessage: '{username} left {server} ({memberCount})',
      }),
    );
    await execute(member);
    expect(fetch).toHaveBeenCalledWith('bye');
    expect(channel.send.mock.calls[0]![0].content).toBe('Leaver left PrimeBuild (168)');
  });

  it.each([
    ['disabled', config({ goodbyeEnabled: false })],
    ['no channel', config({ welcomeChannelId: null })],
    ['unconfigured guild', null],
  ])('stays silent when %s', async (_label, value) => {
    const { member, channel } = fixture();
    vi.mocked(prisma.guild.findUnique).mockResolvedValue(value);
    await execute(member);
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('never posts into a channel of another guild', async () => {
    const { member, channel } = fixture('other');
    vi.mocked(prisma.guild.findUnique).mockResolvedValue(config());
    await execute(member);
    expect(channel.send).not.toHaveBeenCalled();
  });
});
