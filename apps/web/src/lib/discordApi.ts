import { getEnv } from '@doorman/shared';

const API = 'https://discord.com/api/v10';

/** Calls the Discord REST API as the bot (server-managed roles/channels lookups). */
export async function botFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bot ${getEnv().DISCORD_BOT_TOKEN}`, ...init?.headers },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Discord API ${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Calls the Discord REST API on behalf of the logged-in user (OAuth token). */
export async function userFetch<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Discord API ${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  managed: boolean;
  position: number;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
}

export const TEXT_CHANNEL_TYPES = new Set([0, 5]); // GUILD_TEXT, GUILD_ANNOUNCEMENT

export async function fetchGuildRoles(guildId: string): Promise<DiscordRole[]> {
  const roles = await botFetch<DiscordRole[]>(`/guilds/${guildId}/roles`);
  return roles.filter((r) => !r.managed && r.name !== '@everyone').sort((a, b) => b.position - a.position);
}

export async function fetchGuildChannels(guildId: string): Promise<DiscordChannel[]> {
  const channels = await botFetch<DiscordChannel[]>(`/guilds/${guildId}/channels`);
  return channels.filter((c) => TEXT_CHANNEL_TYPES.has(c.type));
}
