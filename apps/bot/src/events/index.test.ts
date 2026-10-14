import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Events, type Client } from 'discord.js';
import { prisma } from '@doorman/database';
import { cacheCreatedInvite, clearInviteCache, warmInviteCache } from '../lib/inviteCache.js';
import { execute as memberJoin } from './guildMemberAdd.js';
import { commands } from '../commands/index.js';
import { registerEvents } from './index.js';

vi.mock('@doorman/database', () => ({ prisma: { guild: { upsert: vi.fn() } } }));
vi.mock('../lib/inviteCache.js', () => ({
  warmInviteCache: vi.fn(),
  clearInviteCache: vi.fn(),
  cacheCreatedInvite: vi.fn(),
}));
vi.mock('./guildMemberAdd.js', () => ({ name: 'guildMemberAdd', execute: vi.fn() }));
vi.mock('../commands/index.js', () => ({
  commands: [{ data: { name: 'test' }, execute: vi.fn() }],
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.mocked(warmInviteCache).mockResolvedValue();
  vi.mocked(cacheCreatedInvite).mockResolvedValue();
  vi.mocked(memberJoin).mockResolvedValue();
});

function fixture() {
  const client = new EventEmitter();
  const registerCommands = vi.fn().mockResolvedValue(undefined);
  registerEvents(client as unknown as Client, registerCommands);
  const emit = async (event: string, ...args: unknown[]) => {
    await Promise.all(client.listeners(event).map((listener) => listener(...args)));
  };
  return { emit, registerCommands };
}

const guild = { id: 'guild', name: 'Guild', available: true };

describe('guild lifecycle and event failures', () => {
  it('continues startup after one guild fails and catches registration failure', async () => {
    const { emit, registerCommands } = fixture();
    vi.mocked(prisma.guild.upsert).mockRejectedValueOnce(new Error('DB failed'));
    registerCommands.mockRejectedValueOnce(new Error('REST failed'));
    const second = { ...guild, id: 'second' };
    await emit(Events.ClientReady, {
      user: { tag: 'test' },
      guilds: {
        cache: new Map([
          ['guild', guild],
          ['second', second],
        ]),
      },
    });
    expect(prisma.guild.upsert).toHaveBeenCalledTimes(2);
    expect(warmInviteCache).toHaveBeenCalledWith(second);
    expect(registerCommands).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it('catches guild-create and member-join errors', async () => {
    const { emit } = fixture();
    vi.mocked(prisma.guild.upsert).mockRejectedValue(new Error('DB failed'));
    vi.mocked(memberJoin).mockRejectedValue(new Error('Join failed'));
    await emit(Events.GuildCreate, guild);
    await emit(Events.GuildMemberAdd, { id: 'member', guild });
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it('clears invite snapshots on removal/outage and rewarms on availability', async () => {
    const { emit } = fixture();
    await emit(Events.GuildDelete, guild);
    await emit(Events.GuildUnavailable, guild);
    expect(clearInviteCache).toHaveBeenCalledTimes(2);
    expect(clearInviteCache).toHaveBeenCalledWith('guild');
    expect(prisma.guild.upsert).not.toHaveBeenCalled();
    await emit(Events.GuildAvailable, guild);
    expect(warmInviteCache).toHaveBeenCalledWith(guild);
  });

  it('does not initialize unavailable guilds', async () => {
    const { emit } = fixture();
    await emit(Events.GuildCreate, { ...guild, available: false });
    expect(prisma.guild.upsert).not.toHaveBeenCalled();
    expect(warmInviteCache).not.toHaveBeenCalled();
  });

  it('does not erase join deltas when invites are created or deleted', async () => {
    const { emit } = fixture();
    await emit(Events.InviteCreate, { guild, code: 'invite', uses: 0 });
    await emit(Events.InviteDelete, { guild, code: 'invite' });
    expect(cacheCreatedInvite).toHaveBeenCalledWith('guild', 'invite', 0);
    expect(warmInviteCache).not.toHaveBeenCalled();
  });

  it.each([
    { deferred: false, replied: false, response: 'reply' },
    { deferred: true, replied: false, response: 'editReply' },
    { deferred: false, replied: true, response: 'followUp' },
    { deferred: true, replied: true, response: 'followUp' },
  ])('reports command failure through $response', async ({ response, ...state }) => {
    const { emit } = fixture();
    vi.mocked(commands[0].execute).mockRejectedValueOnce(new Error('Command failed'));
    const interaction = {
      ...state,
      isChatInputCommand: () => true,
      commandName: 'test',
      reply: vi.fn(),
      editReply: vi.fn(),
      followUp: vi.fn(),
    };
    await emit(Events.InteractionCreate, interaction);
    expect(interaction[response as 'reply' | 'editReply' | 'followUp']).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Something went wrong.' }),
    );
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('catches a failed error reply and Discord client errors', async () => {
    const { emit } = fixture();
    vi.mocked(commands[0].execute).mockRejectedValueOnce(new Error('Command failed'));
    await emit(Events.InteractionCreate, {
      isChatInputCommand: () => true,
      commandName: 'test',
      reply: vi.fn().mockRejectedValue(new Error('Expired')),
    });
    await emit(Events.Error, new Error('Client failed'));
    expect(console.error).toHaveBeenCalledTimes(3);
  });
});
