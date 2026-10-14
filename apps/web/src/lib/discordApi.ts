import {
  canManageGuild,
  getEnv,
  hasPermission,
  isSafeAutoRole,
  PERMISSIONS,
} from '@doorman/shared';
import { z } from 'zod';
import type { DiscordSession, DiscordUserGuild } from './session';

const API = 'https://discord.com/api/v10';

export function assertSnowflake(id: string): void {
  if (!/^\d{1,20}$/.test(id)) throw new Error('Invalid Discord ID');
}

/** Never cache permissions or include Discord response bodies in application errors. */
export async function botFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bot ${getEnv().DISCORD_BOT_TOKEN}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Discord request failed (${res.status})`);
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}

export async function userFetch<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Discord authorization failed (${res.status}); sign in again`);
  return res.json() as Promise<T>;
}

const guildSchema = z.object({
  id: z.string().regex(/^\d{1,20}$/),
  name: z.string(),
  icon: z.string().nullable().optional(),
  owner: z.boolean(),
  permissions: z.string().regex(/^\d+$/),
});

export async function manageableGuilds(
  session: Pick<DiscordSession, 'accessToken'>,
): Promise<DiscordUserGuild[]> {
  const guilds: DiscordUserGuild[] = [];
  let after = '';
  while (true) {
    const page = z
      .array(guildSchema)
      .parse(
        await userFetch(
          session.accessToken,
          `/users/@me/guilds?limit=200${after ? `&after=${after}` : ''}`,
        ),
      );
    guilds.push(...page.filter((g) => canManageGuild(g.permissions, g.owner)));
    if (page.length < 200) return guilds;
    const next = page[page.length - 1]!.id;
    if (next === after) throw new Error('Discord pagination failed');
    after = next;
  }
}

export async function assertCanManageGuild(
  session: Pick<DiscordSession, 'accessToken'>,
  guildId: string,
): Promise<DiscordUserGuild> {
  assertSnowflake(guildId);
  const guild = (await manageableGuilds(session)).find((g) => g.id === guildId);
  if (!guild) throw new Error('Not authorized for this server');
  // A stale database record is not proof that Doorman is still installed.
  await botFetch(`/guilds/${guildId}`);
  return guild;
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  managed: boolean;
  position: number;
  permissions: string;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  permission_overwrites: Array<{ id: string; type: 0 | 1; allow: string }>;
}

const channelOverwritesSchema = z.array(
  z.object({
    permission_overwrites: z.array(
      z.object({
        id: z.string().regex(/^\d{1,20}$/),
        type: z.union([z.literal(0), z.literal(1)]),
        allow: z.string(),
      }),
    ),
  }),
);

export const TEXT_CHANNEL_TYPES = new Set([0, 5]);

export async function fetchGuildRoles(guildId: string): Promise<DiscordRole[]> {
  assertSnowflake(guildId);
  const [roles, bot, channels] = await Promise.all([
    botFetch<DiscordRole[]>(`/guilds/${guildId}/roles`),
    botFetch<{ id: string }>('/users/@me'),
    botFetch<DiscordChannel[]>(`/guilds/${guildId}/channels`),
  ]);
  const overwrites = channelOverwritesSchema
    .parse(channels)
    .flatMap((c) => c.permission_overwrites)
    .filter((o) => o.type === 0);
  assertSnowflake(bot.id);
  const member = await botFetch<{ roles: string[] }>(`/guilds/${guildId}/members/${bot.id}`);
  const botRoles = roles.filter((r) => r.id === guildId || member.roles.includes(r.id));
  const permissions = botRoles.reduce((p, r) => p | BigInt(r.permissions), 0n);
  if (
    !hasPermission(permissions, PERMISSIONS.MANAGE_ROLES) &&
    !hasPermission(permissions, PERMISSIONS.ADMINISTRATOR)
  )
    return [];
  const highest = [...botRoles].sort(
    (a, b) => b.position - a.position || (BigInt(a.id) < BigInt(b.id) ? -1 : 1),
  )[0];
  return roles
    .filter(
      (r) =>
        highest &&
        isSafeAutoRole(r, guildId, overwrites) &&
        (r.position < highest.position ||
          (r.position === highest.position && BigInt(r.id) > BigInt(highest.id))),
    )
    .sort((a, b) => b.position - a.position);
}

export async function fetchGuildChannels(guildId: string): Promise<DiscordChannel[]> {
  assertSnowflake(guildId);
  const channels = await botFetch<DiscordChannel[]>(`/guilds/${guildId}/channels`);
  return channels.filter((c) => TEXT_CHANNEL_TYPES.has(c.type));
}

export async function addRoleViaBot(
  guildId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  [guildId, userId, roleId].forEach(assertSnowflake);
  await botFetch(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: 'PUT' });
}
