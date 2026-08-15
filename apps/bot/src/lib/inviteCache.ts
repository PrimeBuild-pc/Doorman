import type { Guild } from 'discord.js';

// Discord has no "this invite was just used" event, so tracking which invite a
// joining member used is done the standard way: keep a per-guild snapshot of each
// invite's use count, and on join, diff a fresh fetch against it.
const cache = new Map<string, Map<string, number>>();

export async function warmInviteCache(guild: Guild): Promise<void> {
  try {
    const invites = await guild.invites.fetch();
    cache.set(guild.id, new Map(invites.map((inv) => [inv.code, inv.uses ?? 0])));
  } catch {
    // Missing Manage Guild permission, or the guild has no invites yet — invite
    // routing just won't resolve a code here; default-role assignment still works.
    cache.set(guild.id, new Map());
  }
}

export async function resolveUsedInviteCode(guild: Guild): Promise<string | null> {
  const before = cache.get(guild.id) ?? new Map<string, number>();

  let after: Map<string, number>;
  try {
    const invites = await guild.invites.fetch();
    after = new Map(invites.map((inv) => [inv.code, inv.uses ?? 0]));
  } catch {
    return null;
  }
  cache.set(guild.id, after);

  for (const [code, uses] of after) {
    if (uses > (before.get(code) ?? 0)) return code;
  }
  // A single-use invite is deleted by Discord the instant it's used, so it will
  // have vanished from `after` entirely rather than showing a higher use count.
  for (const code of before.keys()) {
    if (!after.has(code)) return code;
  }
  return null;
}
