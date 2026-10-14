'use server';

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@doorman/database';
import { getEnv } from '@doorman/shared';
import { getSession } from '@/lib/session';
import {
  addRoleViaBot,
  assertCanManageGuild,
  assertSnowflake,
  botFetch,
  fetchGuildChannels,
  fetchGuildRoles,
} from '@/lib/discordApi';

async function mutateGuild(
  guildId: string,
  notice: string,
  action: (userId: string) => Promise<void>,
): Promise<never> {
  let failed = false;
  try {
    const session = await getSession();
    if (!session) throw new Error('Not authenticated');
    await assertCanManageGuild(session, guildId);
    await action(session.user.id);
    revalidatePath(`/guilds/${guildId}`);
  } catch {
    // Keep provider, database and credential details out of rendered errors.
    failed = true;
  }
  redirect(
    `/guilds/${encodeURIComponent(guildId)}?${failed ? 'error=change' : `notice=${notice}`}`,
  );
}

export async function updateSettings(guildId: string, formData: FormData): Promise<void> {
  await mutateGuild(guildId, 'saved', async () => {
    const defaultRoleIds = [...new Set(formData.getAll('defaultRoleIds').map(String))];
    const welcomeChannelId = String(formData.get('welcomeChannelId') || '') || null;
    const age = String(formData.get('minAccountAgeHours') ?? '');
    const minAccountAgeHours = Number(age);
    if (
      !/^\d+$/.test(age) ||
      !Number.isSafeInteger(minAccountAgeHours) ||
      minAccountAgeHours > 876_000 ||
      defaultRoleIds.length > 25
    ) {
      throw new Error('Invalid settings');
    }
    const [roles, channels] = await Promise.all([
      fetchGuildRoles(guildId),
      fetchGuildChannels(guildId),
    ]);
    if (
      defaultRoleIds.some((id) => !roles.some((r) => r.id === id)) ||
      (welcomeChannelId && !channels.some((c) => c.id === welcomeChannelId))
    )
      throw new Error('Invalid role or channel');
    await prisma.guild.update({
      where: { id: guildId },
      data: { defaultRoleIds, welcomeChannelId, minAccountAgeHours },
    });
  });
}

export async function uploadBanner(guildId: string, formData: FormData): Promise<void> {
  await mutateGuild(guildId, 'banner', async () => {
    const file = formData.get('banner');
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 5 * 1024 * 1024 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
    )
      throw new Error('Invalid banner');
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16_000_000 });
    const metadata = await image.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1)
      throw new Error('Invalid image');
    const bytes = await image.rotate().resize(1024, 450, { fit: 'cover' }).png().toBuffer();
    const env = getEnv();
    const previous = await prisma.guild.findUniqueOrThrow({
      where: { id: guildId },
      select: { bannerPath: true },
    });
    await fs.mkdir(env.UPLOADS_DIR, { recursive: true });
    const filename = `${guildId}-${crypto.randomUUID()}.png`;
    const target = path.join(env.UPLOADS_DIR, filename);
    await fs.writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
    try {
      await prisma.guild.update({ where: { id: guildId }, data: { bannerPath: filename } });
    } catch (err) {
      await fs.rm(target, { force: true });
      throw err;
    }
    if (
      previous.bannerPath?.startsWith(`${guildId}-`) &&
      /^[\d]+-[\da-f-]{36}\.(png|jpg|webp)$/.test(previous.bannerPath)
    ) {
      await fs.rm(path.join(env.UPLOADS_DIR, previous.bannerPath), { force: true }).catch(() => {
        console.warn('Old banner cleanup failed; check uploads volume permissions');
      });
    }
  });
}

export async function addInviteMap(guildId: string, formData: FormData): Promise<void> {
  await mutateGuild(guildId, 'mapping', async () => {
    const inviteCode = String(formData.get('inviteCode') || '').trim();
    const roleId = String(formData.get('roleId') || '');
    if (!/^[\w-]{1,100}$/.test(inviteCode)) throw new Error('Invalid invite code');
    if (!(await fetchGuildRoles(guildId)).some((r) => r.id === roleId))
      throw new Error('Invalid role');
    await prisma.inviteRoleMap.upsert({
      where: { guildId_inviteCode: { guildId, inviteCode } },
      update: { roleId },
      create: { guildId, inviteCode, roleId },
    });
  });
}

export async function removeInviteMap(guildId: string, id: string): Promise<void> {
  await mutateGuild(guildId, 'removed', async () => {
    const result = await prisma.inviteRoleMap.deleteMany({ where: { id, guildId } });
    if (result.count !== 1) throw new Error('Mapping not found in this server');
  });
}

export async function decidePending(
  guildId: string,
  id: string,
  decision: 'approved' | 'denied',
): Promise<void> {
  await mutateGuild(guildId, decision, async (userId) => {
    if (!['approved', 'denied'].includes(decision)) throw new Error('Invalid decision');
    // Use the same member lock as join handling, including legacy duplicate requests.
    await prisma.$transaction(
      async (tx) => {
        const candidate = await tx.pendingApproval.findUniqueOrThrow({
          where: { id, guildId, status: 'pending' },
        });
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${guildId + ':' + candidate.userId}, 0))`;
        const rows = await tx.$queryRaw<
          { id: string }[]
        >`SELECT "id" FROM "PendingApproval" WHERE "id" = ${id} AND "guildId" = ${guildId} AND "status" = 'pending' FOR UPDATE`;
        if (rows.length !== 1) throw new Error('Member is not pending in this server');
        const pending = await tx.pendingApproval.findUniqueOrThrow({
          where: { id, guildId, status: 'pending' },
        });
        if (decision === 'approved') {
          assertSnowflake(pending.userId);
          const member = await botFetch<{ joined_at: string | null }>(
            `/guilds/${guildId}/members/${pending.userId}`,
          );
          if (Date.parse(member.joined_at ?? '') !== pending.joinedAt.getTime())
            throw new Error('This request belongs to a previous join');
          const config = await tx.guild.findUniqueOrThrow({ where: { id: guildId } });
          const roles = await fetchGuildRoles(guildId);
          if (
            config.defaultRoleIds.length > 25 ||
            config.defaultRoleIds.some((roleId) => !roles.some((r) => r.id === roleId))
          )
            throw new Error('Saved roles are no longer assignable');
          for (const roleId of config.defaultRoleIds)
            await addRoleViaBot(guildId, pending.userId, roleId);
        }
        // Discord PUTs are idempotent: partial failures remain pending and can be retried.
        await tx.pendingApproval.update({
          where: { id, guildId, status: 'pending' },
          data: { status: decision, decidedByUserId: userId, decidedAt: new Date() },
        });
        await tx.pendingApproval.updateMany({
          where: { guildId, userId: pending.userId, status: 'pending', id: { not: id } },
          data: { status: 'superseded' },
        });
      },
      { timeout: 30_000 },
    );
  });
}
