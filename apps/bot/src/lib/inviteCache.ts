import type { Guild } from 'discord.js';

interface GuildInviteCache {
  snapshot: Map<string, number> | null;
  queue: Promise<unknown>;
}

const cache = new Map<string, GuildInviteCache>();

// Serialize snapshots, including warming, so concurrent joins cannot reuse a delta.
function withGuildCache<T>(
  guildId: string,
  work: (state: GuildInviteCache) => Promise<T>,
): Promise<T> {
  let state = cache.get(guildId);
  if (!state) {
    state = { snapshot: null, queue: Promise.resolve() };
    cache.set(guildId, state);
  }
  const current = state;
  const result = current.queue.then(() => work(current));
  current.queue = result.catch(() => {});
  return result;
}

async function fetchSnapshot(guild: Guild): Promise<Map<string, number> | null> {
  try {
    const invites = await guild.invites.fetch();
    if (invites.some((invite) => invite.uses === null)) return null;
    return new Map(invites.map((invite) => [invite.code, invite.uses!]));
  } catch (err) {
    console.warn(`Could not fetch invites for guild ${guild.id}`, err);
    return null;
  }
}

export function clearInviteCache(guildId: string): void {
  cache.delete(guildId);
}

export function cacheCreatedInvite(
  guildId: string,
  code: string,
  uses: number | null,
): Promise<void> {
  return withGuildCache(guildId, async (state) => {
    if (uses !== null && state.snapshot && !state.snapshot.has(code))
      state.snapshot.set(code, uses);
  });
}

export function warmInviteCache(guild: Guild): Promise<void> {
  return withGuildCache(guild.id, async (state) => {
    state.snapshot = await fetchSnapshot(guild);
  });
}

export function resolveUsedInviteCode(guild: Guild): Promise<string | null> {
  return withGuildCache(guild.id, async (state) => {
    const before = state.snapshot;
    const after = await fetchSnapshot(guild);
    state.snapshot = after;
    if (cache.get(guild.id) !== state || !before || !after) return null;

    // A vanished invite could be consumed, revoked or expired: never grant a role on that guess.
    if ([...before.keys()].some((code) => !after.has(code))) return null;
    let candidate: string | null = null;
    for (const [code, uses] of after) {
      const previous = before.get(code);
      if (previous === undefined) {
        if (uses > 0) return null;
        continue;
      }
      const delta = uses - previous;
      if (delta === 0) continue;
      if (delta !== 1 || candidate !== null) return null;
      candidate = code;
    }
    return candidate;
  });
}
