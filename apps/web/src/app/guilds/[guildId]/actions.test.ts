import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  authorize: vi.fn(),
  roles: vi.fn(),
  channels: vi.fn(),
  addRole: vi.fn(),
  botFetch: vi.fn(),
  updateGuild: vi.fn(),
  findGuild: vi.fn(),
  upsertMap: vi.fn(),
  deleteMap: vi.fn(),
  memberLock: vi.fn(),
  lock: vi.fn(),
  findPending: vi.fn(),
  updatePending: vi.fn(),
  supersedePending: vi.fn(),
  transaction: vi.fn(),
  revalidate: vi.fn(),
  uploads: '',
}));
vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/discordApi', () => ({
  assertCanManageGuild: mocks.authorize,
  fetchGuildRoles: mocks.roles,
  fetchGuildChannels: mocks.channels,
  addRoleViaBot: mocks.addRole,
  botFetch: mocks.botFetch,
  assertSnowflake: vi.fn(),
}));
vi.mock('@doorman/shared', () => ({ getEnv: () => ({ UPLOADS_DIR: mocks.uploads }) }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock('@doorman/database', () => ({
  prisma: {
    guild: { update: mocks.updateGuild, findUniqueOrThrow: mocks.findGuild },
    inviteRoleMap: { upsert: mocks.upsertMap, deleteMany: mocks.deleteMap },
    $transaction: mocks.transaction,
  },
}));
import {
  addInviteMap,
  decidePending,
  removeInviteMap,
  updateSettings,
  uploadBanner,
} from './actions';

function form(values: Record<string, string | string[] | File>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}
const success = (notice: string) => `REDIRECT:/guilds/100?notice=${notice}`;
const failure = 'REDIRECT:/guilds/100?error=change';

beforeEach(async () => {
  vi.resetAllMocks();
  mocks.uploads = await fs.mkdtemp(path.join(os.tmpdir(), 'doorman-test-'));
  mocks.getSession.mockResolvedValue({ user: { id: '900' }, accessToken: 'token' });
  mocks.authorize.mockResolvedValue({ id: '100' });
  mocks.roles.mockResolvedValue([{ id: '300' }]);
  mocks.channels.mockResolvedValue([{ id: '400' }]);
  mocks.deleteMap.mockResolvedValue({ count: 1 });
  mocks.lock.mockResolvedValue([{ id: 'pending-id' }]);
  mocks.findPending.mockResolvedValue({
    userId: '200',
    joinedAt: new Date('2026-01-02T00:00:00.000Z'),
  });
  mocks.botFetch.mockResolvedValue({ joined_at: '2026-01-02T00:00:00.000Z' });
  mocks.findGuild.mockResolvedValue({ defaultRoleIds: ['300'], bannerPath: null });
  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      $executeRaw: mocks.memberLock,
      $queryRaw: mocks.lock,
      pendingApproval: {
        findUniqueOrThrow: mocks.findPending,
        update: mocks.updatePending,
        updateMany: mocks.supersedePending,
      },
      guild: { findUniqueOrThrow: mocks.findGuild },
    }),
  );
});
afterEach(async () => {
  await fs.rm(mocks.uploads, { recursive: true, force: true });
});

describe('guild scoped mutations', () => {
  it('rejects stale permissions and unauthenticated writes before any database mutation', async () => {
    mocks.authorize.mockRejectedValue(new Error('Revoked'));
    await expect(removeInviteMap('100', 'foreign')).rejects.toThrow(failure);
    expect(mocks.deleteMap).not.toHaveBeenCalled();
    mocks.getSession.mockResolvedValue(null);
    await expect(updateSettings('100', form({ minAccountAgeHours: '0' }))).rejects.toThrow(failure);
    expect(mocks.updateGuild).not.toHaveBeenCalled();
  });
  it('deletes mappings only within the requested guild', async () => {
    await expect(removeInviteMap('100', 'map-id')).rejects.toThrow(success('removed'));
    expect(mocks.deleteMap).toHaveBeenCalledWith({ where: { id: 'map-id', guildId: '100' } });
    mocks.deleteMap.mockResolvedValue({ count: 0 });
    await expect(removeInviteMap('100', 'foreign')).rejects.toThrow(failure);
  });
  it('validates all submitted roles/channels and deduplicates accepted roles', async () => {
    await expect(
      updateSettings(
        '100',
        form({ defaultRoleIds: ['300', '300'], welcomeChannelId: '400', minAccountAgeHours: '24' }),
      ),
    ).rejects.toThrow(success('saved'));
    expect(mocks.updateGuild).toHaveBeenCalledWith({
      where: { id: '100' },
      data: { defaultRoleIds: ['300'], welcomeChannelId: '400', minAccountAgeHours: 24 },
    });
    mocks.updateGuild.mockClear();
    for (const values of [{ defaultRoleIds: 'foreign' }, { welcomeChannelId: 'foreign' }] as Record<
      string,
      string
    >[]) {
      await expect(
        updateSettings('100', form({ minAccountAgeHours: '0', ...values })),
      ).rejects.toThrow(failure);
    }
    expect(mocks.updateGuild).not.toHaveBeenCalled();
  });
  it.each(['-1', '1.5', 'NaN', 'Infinity', '876001', '', '1e2'])(
    'rejects invalid account age %s',
    async (age) => {
      await expect(updateSettings('100', form({ minAccountAgeHours: age }))).rejects.toThrow(
        failure,
      );
      expect(mocks.updateGuild).not.toHaveBeenCalled();
    },
  );
  it('validates mapping inputs before upsert', async () => {
    await expect(
      addInviteMap('100', form({ inviteCode: 'abc-123', roleId: '300' })),
    ).rejects.toThrow(success('mapping'));
    expect(mocks.upsertMap).toHaveBeenCalledWith({
      where: { guildId_inviteCode: { guildId: '100', inviteCode: 'abc-123' } },
      update: { roleId: '300' },
      create: { guildId: '100', inviteCode: 'abc-123', roleId: '300' },
    });
    mocks.upsertMap.mockClear();
    await expect(
      addInviteMap('100', form({ inviteCode: 'abc', roleId: 'foreign' })),
    ).rejects.toThrow(failure);
    await expect(
      addInviteMap('100', form({ inviteCode: 'https://discord.gg/abc', roleId: '300' })),
    ).rejects.toThrow(failure);
    expect(mocks.upsertMap).not.toHaveBeenCalled();
  });
});

describe('pending approvals', () => {
  it('locks and reads a pending row scoped to the current guild before assigning roles', async () => {
    await expect(decidePending('100', 'pending-id', 'approved')).rejects.toThrow(
      success('approved'),
    );
    const [memberLockSql, memberKey] = mocks.memberLock.mock.calls[0]!;
    expect(memberLockSql.join('?')).toContain('pg_advisory_xact_lock(hashtextextended(?, 0))');
    expect(memberKey).toBe('100:200');
    const [sql, id, guildId] = mocks.lock.mock.calls[0]!;
    expect(sql.join('?')).toContain('"guildId" = ? AND "status" = \'pending\' FOR UPDATE');
    expect([id, guildId]).toEqual(['pending-id', '100']);
    expect(mocks.findPending).toHaveBeenCalledWith({
      where: { id: 'pending-id', guildId: '100', status: 'pending' },
    });
    expect(mocks.addRole).toHaveBeenCalledWith('100', '200', '300');
    expect(mocks.updatePending).toHaveBeenCalledWith({
      where: { id: 'pending-id', guildId: '100', status: 'pending' },
      data: { status: 'approved', decidedByUserId: '900', decidedAt: expect.any(Date) },
    });
    expect(mocks.addRole.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updatePending.mock.invocationCallOrder[0]!,
    );
  });
  it('rejects foreign or already-decided rows before member read or role grant', async () => {
    mocks.lock.mockResolvedValue([]);
    await expect(decidePending('100', 'foreign', 'approved')).rejects.toThrow(failure);
    expect(mocks.findPending).toHaveBeenCalledTimes(1);
    expect(mocks.addRole).not.toHaveBeenCalled();
    expect(mocks.updatePending).not.toHaveBeenCalled();
  });
  it('rejects approval from a previous join and supersedes duplicate requests on a decision', async () => {
    mocks.botFetch.mockResolvedValue({ joined_at: '2026-02-03T00:00:00.000Z' });
    await expect(decidePending('100', 'old-id', 'approved')).rejects.toThrow(failure);
    expect(mocks.addRole).not.toHaveBeenCalled();
    expect(mocks.updatePending).not.toHaveBeenCalled();
    await expect(decidePending('100', 'current-id', 'denied')).rejects.toThrow(success('denied'));
    expect(mocks.supersedePending).toHaveBeenCalledWith({
      where: { guildId: '100', userId: '200', status: 'pending', id: { not: 'current-id' } },
      data: { status: 'superseded' },
    });
  });
  it('keeps a failed role grant pending and refuses now-unsafe configured roles', async () => {
    mocks.addRole.mockRejectedValue(new Error('Discord failed'));
    await expect(decidePending('100', 'pending-id', 'approved')).rejects.toThrow(failure);
    expect(mocks.updatePending).not.toHaveBeenCalled();
    mocks.addRole.mockReset();
    mocks.roles.mockResolvedValue([]);
    await expect(decidePending('100', 'pending-id', 'approved')).rejects.toThrow(failure);
    expect(mocks.addRole).not.toHaveBeenCalled();
  });
  it('denies without assigning roles and rejects unsupported decisions', async () => {
    await expect(decidePending('100', 'pending-id', 'denied')).rejects.toThrow(success('denied'));
    expect(mocks.addRole).not.toHaveBeenCalled();
    expect(mocks.roles).not.toHaveBeenCalled();
    mocks.transaction.mockClear();
    await expect(decidePending('100', 'pending-id', 'evil' as 'denied')).rejects.toThrow(failure);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe('banner upload trust boundary', () => {
  async function png() {
    return sharp({ create: { width: 32, height: 16, channels: 3, background: '#123456' } })
      .png()
      .toBuffer();
  }
  it('decodes and normalizes valid images before storing a random guild-scoped PNG', async () => {
    const bytes = await png();
    await expect(
      uploadBanner(
        '100',
        form({ banner: new File([new Uint8Array(bytes)], 'banner.png', { type: 'image/png' }) }),
      ),
    ).rejects.toThrow(success('banner'));
    const [filename] = await fs.readdir(mocks.uploads);
    expect(filename).toMatch(/^100-[a-f\d-]{36}\.png$/);
    expect(await sharp(path.join(mocks.uploads, filename!)).metadata()).toMatchObject({
      width: 1024,
      height: 450,
      format: 'png',
    });
    expect(mocks.updateGuild).toHaveBeenCalledWith({
      where: { id: '100' },
      data: { bannerPath: filename },
    });
  });
  it('rejects forged image MIME, oversized files and decompression-bomb dimensions', async () => {
    const huge = await sharp({
      create: { width: 5000, height: 4000, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();
    for (const bytes of [Buffer.from('<svg/>'), Buffer.alloc(5 * 1024 * 1024 + 1), huge]) {
      await expect(
        uploadBanner(
          '100',
          form({ banner: new File([new Uint8Array(bytes)], 'x.png', { type: 'image/png' }) }),
        ),
      ).rejects.toThrow(failure);
    }
    expect(await fs.readdir(mocks.uploads)).toEqual([]);
    expect(mocks.updateGuild).not.toHaveBeenCalled();
  });
  it('removes a newly written file if the database update fails', async () => {
    mocks.updateGuild.mockRejectedValue(new Error('DB failed'));
    await expect(
      uploadBanner(
        '100',
        form({ banner: new File([new Uint8Array(await png())], 'x.png', { type: 'image/png' }) }),
      ),
    ).rejects.toThrow(failure);
    expect(await fs.readdir(mocks.uploads)).toEqual([]);
  });
});
