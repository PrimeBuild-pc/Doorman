'use server';

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@doorman/database';
import { getEnv } from '@doorman/shared';
import { getSession, manageableGuilds } from '@/lib/session';

async function assertCanManage(guildId: string): Promise<{ userId: string }> {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!manageableGuilds(session).some((g) => g.id === guildId)) {
    throw new Error('Not authorized for this guild');
  }
  return { userId: session.user.id };
}

export async function updateSettings(guildId: string, formData: FormData): Promise<void> {
  await assertCanManage(guildId);
  const defaultRoleIds = formData.getAll('defaultRoleIds').map(String);
  const welcomeChannelId = String(formData.get('welcomeChannelId') || '') || null;
  const minAccountAgeHours = Math.max(0, Number(formData.get('minAccountAgeHours') || 0));

  await prisma.guild.update({
    where: { id: guildId },
    data: { defaultRoleIds, welcomeChannelId, minAccountAgeHours },
  });
  revalidatePath(`/guilds/${guildId}`);
}

const ALLOWED_BANNER_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export async function uploadBanner(guildId: string, formData: FormData): Promise<void> {
  await assertCanManage(guildId);
  const file = formData.get('banner');
  if (!(file instanceof File) || file.size === 0) return;

  const ext = ALLOWED_BANNER_TYPES[file.type];
  if (!ext) throw new Error('Banner must be PNG, JPEG, or WebP');

  const env = getEnv();
  await fs.mkdir(env.UPLOADS_DIR, { recursive: true });
  const filename = `${guildId}-${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(env.UPLOADS_DIR, filename), Buffer.from(await file.arrayBuffer()));

  await prisma.guild.update({ where: { id: guildId }, data: { bannerPath: filename } });
  revalidatePath(`/guilds/${guildId}`);
}

export async function addInviteMap(guildId: string, formData: FormData): Promise<void> {
  await assertCanManage(guildId);
  const inviteCode = String(formData.get('inviteCode') || '').trim();
  const roleId = String(formData.get('roleId') || '');
  if (!inviteCode || !roleId) return;

  await prisma.inviteRoleMap.upsert({
    where: { guildId_inviteCode: { guildId, inviteCode } },
    update: { roleId },
    create: { guildId, inviteCode, roleId },
  });
  revalidatePath(`/guilds/${guildId}`);
}

export async function removeInviteMap(guildId: string, id: string): Promise<void> {
  await assertCanManage(guildId);
  await prisma.inviteRoleMap.delete({ where: { id } });
  revalidatePath(`/guilds/${guildId}`);
}

async function addRoleViaBot(guildId: string, userId: string, roleId: string): Promise<void> {
  await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: 'PUT',
    headers: { Authorization: `Bot ${getEnv().DISCORD_BOT_TOKEN}` },
  });
}

export async function decidePending(
  guildId: string,
  id: string,
  decision: 'approved' | 'denied',
): Promise<void> {
  const { userId } = await assertCanManage(guildId);

  const pending = await prisma.pendingApproval.update({
    where: { id },
    data: { status: decision, decidedByUserId: userId, decidedAt: new Date() },
  });

  if (decision === 'approved') {
    const guildConfig = await prisma.guild.findUnique({ where: { id: guildId } });
    for (const roleId of guildConfig?.defaultRoleIds ?? []) {
      await addRoleViaBot(guildId, pending.userId, roleId);
    }
  }
  revalidatePath(`/guilds/${guildId}`);
}
