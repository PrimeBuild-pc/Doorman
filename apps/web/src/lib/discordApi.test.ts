import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@doorman/shared', async (original) => ({
  ...(await original<typeof import('@doorman/shared')>()),
  getEnv: () => ({ DISCORD_BOT_TOKEN: 'test-bot-token' }),
}));
import {
  addRoleViaBot,
  assertCanManageGuild,
  botFetch,
  clearGuildListCache,
  fetchGuildRoles,
  groupChannels,
  manageableGuilds,
} from './discordApi';

const fetchMock = vi.fn();
const guild = { id: '100', name: 'Server', owner: false, permissions: '32' };
const role = (id: string, position: number, permissions = '0', managed = false) => ({
  id,
  position,
  permissions,
  managed,
  name: id,
  color: 0,
});
function reply(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(status === 204 ? null : JSON.stringify(body), { status }),
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
  clearGuildListCache();
  vi.stubGlobal('fetch', fetchMock);
});

describe('current Discord authorization', () => {
  it('rechecks permissions once the cached list expires and rejects a revoked manager before bot lookups', async () => {
    reply([guild]);
    reply({ id: guild.id });
    await expect(assertCanManageGuild({ accessToken: 'oauth' }, '100')).resolves.toEqual(guild);
    clearGuildListCache(); // same effect as the 30s expiry
    reply([{ ...guild, permissions: '0' }]);
    await expect(assertCanManageGuild({ accessToken: 'oauth' }, '100')).rejects.toThrow(
      'Not authorized',
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]![1]).toMatchObject({
      cache: 'no-store',
      headers: { Authorization: 'Bearer oauth' },
    });
  });
  it('rejects another guild and invalid path IDs', async () => {
    reply([guild]);
    await expect(assertCanManageGuild({ accessToken: 'oauth' }, '200')).rejects.toThrow(
      'Not authorized',
    );
    await expect(assertCanManageGuild({ accessToken: 'oauth' }, '../100')).rejects.toThrow(
      'Invalid Discord ID',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not authorize a stale installation or a failed OAuth lookup', async () => {
    reply([guild]);
    reply('removed', 403);
    await expect(assertCanManageGuild({ accessToken: 'oauth' }, '100')).rejects.toThrow('(403)');
    reply('secret response', 401);
    await expect(manageableGuilds({ accessToken: 'expired' })).rejects.toThrow('sign in again');
  });
  it('reuses the guild list for 30s per token, then asks Discord again', async () => {
    vi.useFakeTimers();
    reply([guild]);
    await manageableGuilds({ accessToken: 'oauth' });
    await manageableGuilds({ accessToken: 'oauth' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    reply([]);
    await expect(manageableGuilds({ accessToken: 'other' })).resolves.toEqual([]);
    vi.advanceTimersByTime(30_000);
    reply([{ ...guild, permissions: '0' }]);
    await expect(manageableGuilds({ accessToken: 'oauth' })).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('fails closed on malformed permission data', async () => {
    reply([{ ...guild, permissions: 'invalid' }]);
    await expect(manageableGuilds({ accessToken: 'oauth' })).rejects.toThrow();
  });
  it('paginates guilds so servers beyond the first page remain accessible', async () => {
    reply(
      Array.from({ length: 200 }, (_, i) => ({ ...guild, id: String(i + 1), permissions: '0' })),
    );
    reply([{ ...guild, id: '201' }]);
    await expect(manageableGuilds({ accessToken: 'oauth' })).resolves.toEqual([
      { ...guild, id: '201' },
    ]);
    expect(fetchMock.mock.calls[1]![0]).toContain('after=200');
  });
});

describe('safe role assignment', () => {
  function rolesReply(
    roles: ReturnType<typeof role>[],
    botRoles = ['500'],
    channels: unknown = [],
  ) {
    reply(roles);
    reply({ id: '900' });
    reply(channels);
    reply({ roles: botRoles });
  }
  it('excludes foreign/managed/everyone/privileged roles and anything at or above the bot', async () => {
    rolesReply([
      role('100', 0),
      role('500', 5, String(1n << 28n), true),
      role('600', 2),
      role('610', 3, '8'),
      role('620', 3, '0', true),
      role('700', 6),
      role('400', 5),
      role('800', 5),
    ]);
    expect((await fetchGuildRoles('100')).map((r) => r.id)).toEqual(['800', '600']);
  });
  it('returns no assignable roles without Manage Roles, but supports administrator bots', async () => {
    rolesReply([role('100', 0), role('500', 5), role('600', 1)]);
    expect(await fetchGuildRoles('100')).toEqual([]);
    rolesReply([role('100', 0), role('500', 5, '8'), role('600', 1)]);
    expect((await fetchGuildRoles('100')).map((r) => r.id)).toEqual(['600']);
  });
  it.each([0, 2, 4, 15])(
    'excludes a zero-permission role with Manage Messages on channel type %s',
    async (type) => {
      rolesReply(
        [role('100', 0), role('500', 5, String(1n << 28n), true), role('600', 1), role('700', 2)],
        ['500'],
        [
          {
            id: '800',
            name: 'channel',
            type,
            permission_overwrites: [{ id: '600', type: 0, allow: String(1n << 13n) }],
          },
        ],
      );
      expect((await fetchGuildRoles('100')).map((r) => r.id)).toEqual(['700']);
      expect(fetchMock.mock.calls[2]![0]).toContain('/guilds/100/channels');
    },
  );
  it('accepts ordinary role overwrites and ignores member and unrelated role overwrites', async () => {
    rolesReply(
      [role('100', 0), role('500', 5, String(1n << 28n), true), role('600', 1)],
      ['500'],
      [
        {
          permission_overwrites: [
            { id: '600', type: 0, allow: String(1n << 10n) },
            { id: '600', type: 1, allow: String(1n << 13n) },
            { id: '700', type: 0, allow: String(1n << 13n) },
          ],
        },
      ],
    );
    expect((await fetchGuildRoles('100')).map((r) => r.id)).toEqual(['600']);
  });
  it('excludes a role with malformed overwrite permissions', async () => {
    rolesReply(
      [role('100', 0), role('500', 5, String(1n << 28n), true), role('600', 1)],
      ['500'],
      [{ permission_overwrites: [{ id: '600', type: 0, allow: 'invalid' }] }],
    );
    expect(await fetchGuildRoles('100')).toEqual([]);
  });
  it.each([
    {},
    { permission_overwrites: null },
    { permission_overwrites: [{ id: '600', allow: '0' }] },
    { permission_overwrites: [{ id: '600', type: 0 }] },
  ])('fails closed when channel overwrite data is missing or malformed', async (channel) => {
    rolesReply(
      [role('100', 0), role('500', 5, String(1n << 28n), true), role('600', 1)],
      ['500'],
      [channel],
    );
    await expect(fetchGuildRoles('100')).rejects.toThrow();
  });
  it('fails closed when channels cannot be fetched', async () => {
    reply([role('500', 5, String(1n << 28n), true), role('600', 1)]);
    reply({ id: '900' });
    reply('unavailable', 403);
    await expect(fetchGuildRoles('100')).rejects.toThrow('Discord request failed (403)');
  });
  it('accepts 204 and rejects Discord failures without leaking response bodies', async () => {
    reply(null, 204);
    await expect(addRoleViaBot('100', '200', '300')).resolves.toBeUndefined();
    reply('sensitive detail', 403);
    await expect(botFetch('/example')).rejects.toThrow('Discord request failed (403)');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'PUT', cache: 'no-store' });
  });
});

describe('channel grouping', () => {
  it('orders text channels under their categories like the Discord sidebar', () => {
    const ch = (id: string, type: number, position: number, parent_id: string | null = null) => ({
      id,
      name: `n${id}`,
      type,
      position,
      parent_id,
      permission_overwrites: [],
    });
    expect(
      groupChannels([
        ch('c2', 4, 2),
        ch('c1', 4, 1),
        ch('t3', 0, 1, 'c1'),
        ch('t2', 5, 0, 'c1'),
        ch('v1', 2, 0, 'c1'),
        ch('t1', 0, 0),
        ch('empty', 4, 3),
        ch('orphan', 0, 5, 'gone'),
      ]),
    ).toEqual([
      {
        category: null,
        channels: [
          { id: 't1', name: 'nt1' },
          { id: 'orphan', name: 'norphan' },
        ],
      },
      {
        category: 'nc1',
        channels: [
          { id: 't2', name: 'nt2' },
          { id: 't3', name: 'nt3' },
        ],
      },
    ]);
  });
});
