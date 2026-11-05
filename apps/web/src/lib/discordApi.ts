import {
  canManageGuild,
  getEnv,
  hasPermission,
  isSafeAutoRole,
  PERMISSIONS,
} from '@doorman/shared';
import { createHash } from 'node:crypto';
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

/**
 * Discord rate-limits /users/@me/guilds hard (a page load plus a form save is enough
 * to get 429). Reuse the list briefly per token: a revoked Manage Server permission
 * is noticed within GUILD_LIST_TTL_MS; bot presence is still checked live.
 */
const GUILD_LIST_TTL_MS = 30_000;
const guildListCache = new Map<string, { at: number; guilds: DiscordUserGuild[] }>();

export function clearGuildListCache(): void {
  guildListCache.clear();
}

export async function manageableGuilds(
  session: Pick<DiscordSession, 'accessToken'>,
): Promise<DiscordUserGuild[]> {
  const key = createHash('sha256').update(session.accessToken).digest('hex');
  const now = Date.now();
  const cached = guildListCache.get(key);
  if (cached && now - cached.at < GUILD_LIST_TTL_MS) return cached.guilds;
  for (const [k, v] of guildListCache)
    if (now - v.at >= GUILD_LIST_TTL_MS) guildListCache.delete(k);
  const guilds = await fetchManageableGuilds(session.accessToken);
  guildListCache.set(key, { at: now, guilds });
  return guilds;
}

async function fetchManageableGuilds(accessToken: string): Promise<DiscordUserGuild[]> {
  const guilds: DiscordUserGuild[] = [];
  let after = '';
  while (true) {
    const page = z
      .array(guildSchema)
      .parse(
        await userFetch(
          accessToken,
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
  position?: number;
  parent_id?: string | null;
  permission_overwrites: Array<{ id: string; type: 0 | 1; allow: string }>;
}

export interface ChannelGroup {
  /** Category name, or null for channels outside any category. */
  category: string | null;
  channels: Array<{ id: string; name: string }>;
}

/** Text channels grouped and ordered like the Discord sidebar, for channel pickers. */
export function groupChannels(all: DiscordChannel[]): ChannelGroup[] {
  const byPosition = (a: DiscordChannel, b: DiscordChannel) =>
    (a.position ?? 0) - (b.position ?? 0);
  const text = all.filter((c) => TEXT_CHANNEL_TYPES.has(c.type)).sort(byPosition);
  const categories = all.filter((c) => c.type === CATEGORY_TYPE).sort(byPosition);
  const pick = (c: DiscordChannel) => ({ id: c.id, name: c.name });
  const known = new Set(categories.map((c) => c.id));
  return [
    {
      category: null,
      channels: text.filter((c) => !c.parent_id || !known.has(c.parent_id)).map(pick),
    },
    ...categories.map((cat) => ({
      category: cat.name,
      channels: text.filter((c) => c.parent_id === cat.id).map(pick),
    })),
  ].filter((group) => group.channels.length > 0);
}

export async function fetchChannelGroups(guildId: string): Promise<ChannelGroup[]> {
  assertSnowflake(guildId);
  return groupChannels(await botFetch<DiscordChannel[]>(`/guilds/${guildId}/channels`));
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
const CATEGORY_TYPE = 4;

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
