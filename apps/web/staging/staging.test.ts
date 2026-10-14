import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { prisma } from '@doorman/database';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';

const discord = vi.hoisted(() => ({ addRole: vi.fn(), member: vi.fn() }));
vi.mock('@/lib/session', () => ({ getSession: async () => ({ user: { id: '900' } }) }));
vi.mock('@/lib/discordApi', () => ({
  assertCanManageGuild: async () => undefined,
  assertSnowflake: () => undefined,
  fetchGuildRoles: async () => [{ id: '300' }],
  addRoleViaBot: discord.addRole,
  botFetch: discord.member,
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock('../../bot/src/lib/inviteCache.js', () => ({ resolveUsedInviteCode: async () => null }));
import { decidePending, uploadBanner } from '../src/app/guilds/[guildId]/actions';
import { execute as join } from '../../bot/src/events/guildMemberAdd';
import { renderWelcomeCard } from '../../bot/src/lib/welcomeCard';

// Refuse accidental execution outside the disposable Compose verification project.
if (
  process.env.DOORMAN_STAGING_CHECK !== '1' ||
  new URL(process.env.DATABASE_URL!).hostname !== 'db'
)
  throw new Error('Run only through scripts/verify-staging.py');

const guildId = '100';
const joinedAt = new Date('2026-01-02T00:00:00.000Z');
const createPending = () =>
  prisma.pendingApproval.create({
    data: {
      guildId,
      userId: '200',
      username: 'Synthetic member',
      joinedAt,
      accountCreatedAt: joinedAt,
    },
  });
const decide = (id: string, decision: 'approved' | 'denied' = 'approved', guild = guildId) =>
  decidePending(guild, id, decision).catch((error: Error) => error.message);
const waitForBlockedTransaction = () =>
  vi.waitFor(
    async () => {
      const [row] = await prisma.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_stat_activity
    WHERE datname = current_database() AND wait_event = 'advisory'`;
      expect(row!.count).toBe(1);
    },
    { timeout: 2_000, interval: 20 },
  );

beforeEach(async () => {
  vi.resetAllMocks();
  discord.member.mockResolvedValue({ joined_at: joinedAt.toISOString() });
  await prisma.pendingApproval.deleteMany({ where: { guildId } });
  await prisma.guild.update({
    where: { id: guildId },
    data: { defaultRoleIds: ['300'], minAccountAgeHours: 0 },
  });
});
afterAll(async () => {
  await prisma.$disconnect();
});

it('preserves a populated legacy schema and ownership across the upgrade', async () => {
  const legacy = await prisma.guild.findUniqueOrThrow({ where: { id: 'legacy' } });
  expect(legacy.name).toBe('Legacy synthetic guild');
  expect(legacy.defaultRoleIds).toEqual(['300']);
  expect(await prisma.inviteRoleMap.count({ where: { guildId: 'legacy' } })).toBe(1);
  expect(
    await prisma.pendingApproval.count({ where: { guildId: 'legacy', status: 'pending' } }),
  ).toBe(2);
  expect(await prisma.joinEvent.count({ where: { guildId: 'legacy' } })).toBe(1);
  expect(
    await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('integration-probe', 0))`,
  ).toBe(1);
});

it('serializes two approvals on PostgreSQL and supersedes legacy duplicates exactly once', async () => {
  const pending = await createPending();
  const duplicate = await createPending();
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  discord.addRole.mockImplementation(async () => {
    entered();
    await gate;
  });
  const first = decide(pending.id);
  await started;
  const second = decide(pending.id);
  try {
    await waitForBlockedTransaction();
    expect(discord.addRole).toHaveBeenCalledTimes(1);
    expect(
      (await prisma.pendingApproval.findUniqueOrThrow({ where: { id: pending.id } })).status,
    ).toBe('pending');
  } finally {
    release();
  }
  expect(await Promise.all([first, second])).toEqual([
    'REDIRECT:/guilds/100?notice=approved',
    'REDIRECT:/guilds/100?error=change',
  ]);
  expect(discord.addRole).toHaveBeenCalledTimes(1);
  expect(
    (await prisma.pendingApproval.findUniqueOrThrow({ where: { id: pending.id } })).decidedByUserId,
  ).toBe('900');
  expect(
    (await prisma.pendingApproval.findUniqueOrThrow({ where: { id: duplicate.id } })).status,
  ).toBe('superseded');
});

it('rejects cross-guild and stale-join decisions, rolls back provider failure, and supports denial', async () => {
  const pending = await createPending();
  expect(await decide(pending.id, 'approved', '101')).toBe('REDIRECT:/guilds/101?error=change');
  discord.member.mockResolvedValueOnce({ joined_at: '2026-02-02T00:00:00.000Z' });
  expect(await decide(pending.id)).toBe('REDIRECT:/guilds/100?error=change');
  expect(discord.addRole).not.toHaveBeenCalled();
  discord.addRole.mockRejectedValueOnce(new Error('Synthetic provider failure'));
  expect(await decide(pending.id)).toBe('REDIRECT:/guilds/100?error=change');
  const unchanged = await prisma.pendingApproval.findUniqueOrThrow({ where: { id: pending.id } });
  expect(unchanged.status).toBe('pending');
  expect(unchanged.decidedAt).toBeNull();
  expect(await decide(pending.id, 'denied')).toBe('REDIRECT:/guilds/100?notice=denied');
  expect(
    (await prisma.pendingApproval.findUniqueOrThrow({ where: { id: pending.id } })).status,
  ).toBe('denied');
});

it('serializes a real bot rejoin behind an approval without connecting to Discord', async () => {
  const pending = await createPending();
  await prisma.guild.update({ where: { id: guildId }, data: { minAccountAgeHours: 876_000 } });
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  discord.addRole.mockImplementation(async () => {
    entered();
    await gate;
  });
  const approval = decide(pending.id);
  await started;
  const rejoin = join({
    id: '200',
    guild: { id: guildId },
    joinedAt: new Date('2026-02-02T00:00:00.000Z'),
    user: { username: 'Synthetic rejoin', createdTimestamp: joinedAt.getTime() },
  } as Parameters<typeof join>[0]);
  try {
    await waitForBlockedTransaction();
    expect(await prisma.pendingApproval.count({ where: { guildId } })).toBe(1);
  } finally {
    release();
  }
  expect(await approval).toBe('REDIRECT:/guilds/100?notice=approved');
  await rejoin;
  const rows = await prisma.pendingApproval.findMany({ where: { guildId } });
  expect(rows.map((row) => row.status).sort()).toEqual(['approved', 'pending']);
  expect(rows.find((row) => row.status === 'pending')!.joinedAt.toISOString()).toBe(
    '2026-02-02T00:00:00.000Z',
  );
});

it.each(['png', 'jpeg', 'webp'] as const)(
  'decodes %s on the non-root volume and renders native canvas',
  async (format) => {
    const input = await sharp({
      create: { width: 64, height: 64, channels: 4, background: '#335577' },
    })
      .toFormat(format)
      .toBuffer();
    const form = new FormData();
    form.set(
      'banner',
      new File([new Uint8Array(input)], `synthetic.${format}`, { type: `image/${format}` }),
    );
    await expect(uploadBanner(guildId, form)).rejects.toThrow('notice=banner');
    const old = (await prisma.guild.findUniqueOrThrow({ where: { id: guildId } })).bannerPath!;
    await expect(uploadBanner(guildId, form)).rejects.toThrow('notice=banner');
    await expect(fs.stat(path.join(process.env.UPLOADS_DIR!, old))).rejects.toThrow();
    const current = (await prisma.guild.findUniqueOrThrow({ where: { id: guildId } })).bannerPath!;
    const banner = path.join(process.env.UPLOADS_DIR!, current);
    expect((await fs.stat(banner)).uid).toBe(1000);
    const result = await renderWelcomeCard(
      banner,
      `data:image/png;base64,${input.toString('base64')}`,
      'Synthetic member',
    );
    const metadata = await sharp(result).metadata();
    expect([metadata.format, metadata.width, metadata.height]).toEqual(['png', 1024, 450]);
    form.set('banner', new File(['not an image'], 'bad.png', { type: 'image/png' }));
    await expect(uploadBanner(guildId, form)).rejects.toThrow('error=change');
    expect((await prisma.guild.findUniqueOrThrow({ where: { id: guildId } })).bannerPath).toBe(
      current,
    );
  },
);
