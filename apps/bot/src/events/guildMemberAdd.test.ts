import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import { prisma } from '@doorman/database';
import { resolveUsedInviteCode } from '../lib/inviteCache.js';
import { renderWelcomeCard } from '../lib/welcomeCard.js';
import { execute } from './guildMemberAdd.js';

vi.mock('@doorman/database', () => ({
  prisma: {
    guild: { findUnique: vi.fn() },
    inviteRoleMap: { findUnique: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    pendingApproval: { create: vi.fn(), updateMany: vi.fn() },
    joinEvent: { create: vi.fn() },
  },
}));
vi.mock('../lib/inviteCache.js', () => ({ resolveUsedInviteCode: vi.fn() }));
vi.mock('../lib/welcomeCard.js', () => ({ renderWelcomeCard: vi.fn() }));
vi.mock('@doorman/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@doorman/shared')>()),
  getEnv: () => ({ UPLOADS_DIR: '/test/uploads' }),
}));

function memberFixture() {
  const roles = new Map([
    [
      'safe',
      {
        id: 'safe',
        managed: false,
        permissions: { bitfield: PermissionFlagsBits.ViewChannel },
        position: 1,
      },
    ],
    [
      'unsafe',
      {
        id: 'unsafe',
        managed: false,
        permissions: { bitfield: PermissionFlagsBits.Administrator },
        position: 1,
      },
    ],
    ['managed', { id: 'managed', managed: true, permissions: { bitfield: 0n }, position: 1 }],
    ['high', { id: 'high', managed: false, permissions: { bitfield: 0n }, position: 20 }],
    ['guild', { id: 'guild', managed: false, permissions: { bitfield: 0n }, position: 0 }],
    ['failed', { id: 'failed', managed: false, permissions: { bitfield: 0n }, position: 1 }],
  ]);
  const bot = {
    permissions: { has: vi.fn().mockReturnValue(true) },
    roles: { highest: { comparePositionTo: (role: { position: number }) => 10 - role.position } },
  };
  const channel = {
    guildId: 'guild',
    isTextBased: () => true,
    send: vi.fn(),
    permissionOverwrites: { cache: new Map<string, { id: string; allow: { bitfield: bigint } }>() },
  };
  const channels = new Map([['welcome', channel]]);
  const member = {
    id: '175928847299117063',
    joinedAt: new Date('2026-01-01T12:34:56.789Z') as Date | null,
    user: {
      username: 'Member',
      createdTimestamp: 1462015105796,
      displayAvatarURL: vi.fn().mockReturnValue('https://cdn.discordapp.com/avatar.png'),
    },
    guild: {
      id: 'guild',
      roles: { fetch: vi.fn().mockResolvedValue(roles) },
      members: { fetchMe: vi.fn().mockResolvedValue(bot) },
      channels: {
        fetch: vi.fn().mockImplementation(async (id?: string) => (id ? channel : channels)),
      },
    },
    roles: {
      add: vi.fn().mockImplementation(async (id: string) => {
        if (id === 'failed') throw new Error('Forbidden');
      }),
    },
  };
  return { member, bot, channel, channels };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(resolveUsedInviteCode).mockResolvedValue(null);
  vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
    (callback as (tx: typeof prisma) => Promise<unknown>)(prisma),
  );
  vi.mocked(prisma.guild.findUnique).mockResolvedValue({
    id: 'guild',
    defaultRoleIds: ['safe'],
    welcomeChannelId: null,
    bannerPath: null,
    minAccountAgeHours: 0,
  } as never);
});

describe('member join', () => {
  it('only assigns safe, editable roles and only records successful additions', async () => {
    const { member } = memberFixture();
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({
      id: 'guild',
      defaultRoleIds: ['unsafe', 'managed', 'high', 'guild', 'missing', 'failed', 'safe'],
      minAccountAgeHours: 0,
    } as never);
    await execute(member as unknown as GuildMember);
    expect(member.roles.add.mock.calls.map(([id]) => id)).toEqual(['failed', 'safe']);
    expect(prisma.joinEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ rolesAssigned: ['safe'] }),
    });
    expect(console.warn).toHaveBeenCalled();
  });

  it('does not assign roles if the bot cannot manage roles', async () => {
    const { member, bot } = memberFixture();
    bot.permissions.has.mockReturnValue(false);
    await execute(member as unknown as GuildMember);
    expect(member.roles.add).not.toHaveBeenCalled();
    expect(prisma.joinEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ rolesAssigned: [] }),
    });
  });

  it('continues and logs an empty assignment if role lookup fails', async () => {
    const { member } = memberFixture();
    member.guild.roles.fetch.mockRejectedValue(new Error('Unavailable'));
    await execute(member as unknown as GuildMember);
    expect(member.roles.add).not.toHaveBeenCalled();
    expect(prisma.joinEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ rolesAssigned: [] }),
    });
  });

  it('skips roles granted unsafe permissions by any guild channel overwrite', async () => {
    const { member, channels } = memberFixture();
    channels.set('other', {
      ...channels.get('welcome')!,
      permissionOverwrites: {
        cache: new Map([
          ['safe', { id: 'safe', allow: { bitfield: PermissionFlagsBits.ManageMessages } }],
        ]),
      },
    });
    await execute(member as unknown as GuildMember);
    expect(member.guild.channels.fetch).toHaveBeenCalledWith();
    expect(member.roles.add).not.toHaveBeenCalled();
    expect(prisma.joinEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ rolesAssigned: [] }),
    });
  });

  it('fails role assignment closed when channel lookup fails but still sends the welcome', async () => {
    const { member, channel } = memberFixture();
    member.guild.channels.fetch.mockRejectedValueOnce(new Error('Unavailable'));
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({
      defaultRoleIds: ['safe'],
      minAccountAgeHours: 0,
      welcomeChannelId: 'welcome',
      bannerPath: 'guild-banner.png',
    } as never);
    vi.mocked(renderWelcomeCard).mockResolvedValue(Buffer.from('png'));
    await execute(member as unknown as GuildMember);
    expect(member.roles.add).not.toHaveBeenCalled();
    expect(channel.send).toHaveBeenCalled();
    expect(prisma.joinEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ rolesAssigned: [], welcomeSent: true }),
    });
  });

  it('scopes invite mappings to the joining guild and validates their role too', async () => {
    const { member } = memberFixture();
    vi.mocked(resolveUsedInviteCode).mockResolvedValue('invite');
    vi.mocked(prisma.inviteRoleMap.findUnique).mockResolvedValue({ roleId: 'unsafe' } as never);
    await execute(member as unknown as GuildMember);
    expect(prisma.inviteRoleMap.findUnique).toHaveBeenCalledWith({
      where: { guildId_inviteCode: { guildId: 'guild', inviteCode: 'invite' } },
    });
    expect(member.roles.add.mock.calls.map(([id]) => id)).toEqual(['safe']);
  });

  it('sends a welcome for the same guild using a banner basename inside uploads', async () => {
    const { member, channel } = memberFixture();
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({
      defaultRoleIds: [],
      minAccountAgeHours: 0,
      welcomeChannelId: 'welcome',
      bannerPath: 'guild-banner.png',
    } as never);
    vi.mocked(renderWelcomeCard).mockResolvedValue(Buffer.from('png'));
    await execute(member as unknown as GuildMember);
    expect(renderWelcomeCard).toHaveBeenCalledWith(
      path.join('/test/uploads', 'guild-banner.png'),
      'https://cdn.discordapp.com/avatar.png',
      'Member',
    );
    expect(channel.send).toHaveBeenCalledWith({
      content: `Welcome <@${member.id}>!`,
      files: [{ attachment: Buffer.from('png'), name: 'welcome.png' }],
    });
    expect(prisma.joinEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ welcomeSent: true }),
    });
  });

  it('never renders or sends to a channel belonging to another guild', async () => {
    const { member, channel } = memberFixture();
    channel.guildId = 'another-guild';
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({
      defaultRoleIds: [],
      minAccountAgeHours: 0,
      welcomeChannelId: 'welcome',
      bannerPath: 'guild-banner.png',
    } as never);
    await execute(member as unknown as GuildMember);
    expect(renderWelcomeCard).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
    expect(prisma.joinEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ welcomeSent: false }),
    });
  });

  it.each([
    '../outside.png',
    '..\\outside.png',
    '/outside.png',
    'C:\\outside.png',
    'C:outside.png',
    'sub/banner.png',
    'sub\\banner.png',
    '.',
    '..',
  ])('rejects unsafe banner path %s without losing the join record', async (bannerPath) => {
    const { member, channel } = memberFixture();
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({
      defaultRoleIds: [],
      minAccountAgeHours: 0,
      welcomeChannelId: 'welcome',
      bannerPath,
    } as never);
    await execute(member as unknown as GuildMember);
    expect(renderWelcomeCard).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
    expect(prisma.joinEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ welcomeSent: false }),
    });
    expect(console.warn).toHaveBeenCalled();
  });

  it('records the join even when card rendering fails', async () => {
    const { member, channel } = memberFixture();
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({
      defaultRoleIds: [],
      minAccountAgeHours: 0,
      welcomeChannelId: 'welcome',
      bannerPath: 'guild-banner.png',
    } as never);
    vi.mocked(renderWelcomeCard).mockRejectedValue(new Error('Avatar timed out'));
    await execute(member as unknown as GuildMember);
    expect(channel.send).not.toHaveBeenCalled();
    expect(prisma.joinEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ welcomeSent: false }),
    });
    expect(console.warn).toHaveBeenCalled();
  });

  it('advances invite tracking before the anti-raid early return', async () => {
    const { member } = memberFixture();
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({
      minAccountAgeHours: Number.MAX_SAFE_INTEGER,
    } as never);
    await execute(member as unknown as GuildMember);
    expect(resolveUsedInviteCode).toHaveBeenCalledWith(member.guild);
    expect(prisma.pendingApproval.create).toHaveBeenCalled();
    expect(member.roles.add).not.toHaveBeenCalled();
  });

  it('locks each pending join, supersedes legacy duplicates and stores the Discord timestamp', async () => {
    const { member } = memberFixture();
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({
      minAccountAgeHours: Number.MAX_SAFE_INTEGER,
    } as never);
    const pending = [
      { guildId: 'guild', userId: member.id, status: 'pending' },
      { guildId: 'guild', userId: member.id, status: 'pending' },
      { guildId: 'guild', userId: member.id, status: 'approved' },
      { guildId: 'other-guild', userId: member.id, status: 'pending' },
      { guildId: 'guild', userId: 'other-member', status: 'pending' },
    ];
    vi.mocked(prisma.pendingApproval.updateMany).mockImplementation((args) => {
      const matches = pending.filter(
        (row) =>
          row.guildId === args.where?.guildId &&
          row.userId === args.where?.userId &&
          row.status === args.where?.status,
      );
      for (const row of matches) row.status = args.data.status as string;
      return Promise.resolve({ count: matches.length }) as never;
    });
    vi.mocked(prisma.pendingApproval.create).mockImplementation(({ data }) => {
      pending.push({ guildId: data.guildId!, userId: data.userId, status: 'pending' });
      return Promise.resolve(data) as never;
    });

    await execute(member as unknown as GuildMember);
    member.joinedAt = new Date('2026-01-02T12:34:56.123Z');
    await execute(member as unknown as GuildMember);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    for (const [query, key] of vi.mocked(prisma.$executeRaw).mock.calls) {
      expect([...(query as TemplateStringsArray)]).toEqual([
        'SELECT pg_advisory_xact_lock(hashtextextended(',
        ', 0))',
      ]);
      expect(key).toBe(`guild:${member.id}`);
    }
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    expect(prisma.pendingApproval.updateMany).toHaveBeenCalledWith({
      where: { guildId: 'guild', userId: member.id, status: 'pending' },
      data: { status: 'superseded' },
    });
    const lockOrder = vi.mocked(prisma.$executeRaw).mock.invocationCallOrder;
    const updateOrder = vi.mocked(prisma.pendingApproval.updateMany).mock.invocationCallOrder;
    const createOrder = vi.mocked(prisma.pendingApproval.create).mock.invocationCallOrder;
    for (let i = 0; i < 2; i++) {
      expect(lockOrder[i]).toBeLessThan(updateOrder[i]);
      expect(updateOrder[i]).toBeLessThan(createOrder[i]);
    }
    expect(prisma.pendingApproval.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ joinedAt: new Date('2026-01-01T12:34:56.789Z') }),
    });
    expect(prisma.pendingApproval.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ joinedAt: member.joinedAt }),
    });
    expect(pending.map((row) => row.status)).toEqual([
      'superseded',
      'superseded',
      'approved',
      'pending',
      'pending',
      'superseded',
      'pending',
    ]);
    expect(member.roles.add).not.toHaveBeenCalled();
    expect(renderWelcomeCard).not.toHaveBeenCalled();
    expect(prisma.joinEvent.create).not.toHaveBeenCalled();
  });

  it('does not create an approvable record without the actual Discord join timestamp', async () => {
    const { member } = memberFixture();
    member.joinedAt = null;
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({
      minAccountAgeHours: Number.MAX_SAFE_INTEGER,
    } as never);
    await expect(execute(member as unknown as GuildMember)).rejects.toThrow(
      'Discord member join timestamp is missing',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.pendingApproval.create).not.toHaveBeenCalled();
    expect(member.roles.add).not.toHaveBeenCalled();
  });

  it('stops before creation when superseding the old pending joins fails', async () => {
    const { member } = memberFixture();
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({
      minAccountAgeHours: Number.MAX_SAFE_INTEGER,
    } as never);
    vi.mocked(prisma.pendingApproval.updateMany).mockRejectedValue(new Error('DB failed'));
    await expect(execute(member as unknown as GuildMember)).rejects.toThrow('DB failed');
    expect(prisma.pendingApproval.create).not.toHaveBeenCalled();
    expect(member.roles.add).not.toHaveBeenCalled();
  });

  it('advances invite tracking even for unconfigured guilds', async () => {
    const { member } = memberFixture();
    vi.mocked(prisma.guild.findUnique).mockResolvedValue(null);
    await execute(member as unknown as GuildMember);
    expect(resolveUsedInviteCode).toHaveBeenCalledWith(member.guild);
    expect(member.roles.add).not.toHaveBeenCalled();
  });
});
