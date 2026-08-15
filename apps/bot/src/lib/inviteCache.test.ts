import { describe, expect, it } from 'vitest';
import { resolveUsedInviteCode, warmInviteCache } from './inviteCache.js';

function fakeGuild(id: string, invites: Array<{ code: string; uses: number }>) {
  // Mimics discord.js's Collection, which (unlike a plain Map) has an
  // array-style .map() — production code relies on that.
  return {
    id,
    invites: {
      fetch: async () => invites,
    },
  } as never;
}

describe('invite cache', () => {
  it('detects the invite whose use count went up', async () => {
    const guildId = 'guild-1';
    await warmInviteCache(fakeGuild(guildId, [{ code: 'abc', uses: 3 }, { code: 'xyz', uses: 0 }]));
    const code = await resolveUsedInviteCode(fakeGuild(guildId, [{ code: 'abc', uses: 4 }, { code: 'xyz', uses: 0 }]));
    expect(code).toBe('abc');
  });

  it('detects a single-use invite that disappeared after being consumed', async () => {
    const guildId = 'guild-2';
    await warmInviteCache(fakeGuild(guildId, [{ code: 'once', uses: 0 }]));
    const code = await resolveUsedInviteCode(fakeGuild(guildId, []));
    expect(code).toBe('once');
  });

  it('returns null when no invite use count changed', async () => {
    const guildId = 'guild-3';
    await warmInviteCache(fakeGuild(guildId, [{ code: 'abc', uses: 1 }]));
    const code = await resolveUsedInviteCode(fakeGuild(guildId, [{ code: 'abc', uses: 1 }]));
    expect(code).toBeNull();
  });
});
