import { describe, expect, it, vi } from 'vitest';
import type { Guild } from 'discord.js';
import {
  cacheCreatedInvite,
  clearInviteCache,
  resolveUsedInviteCode,
  warmInviteCache,
} from './inviteCache.js';

function fakeGuild(id: string, invites: Array<{ code: string; uses: number | null }>): Guild {
  return { id, invites: { fetch: async () => invites } } as unknown as Guild;
}

describe('invite cache', () => {
  it('detects the only invite whose use count increased by one', async () => {
    await warmInviteCache(
      fakeGuild('increase', [
        { code: 'abc', uses: 3 },
        { code: 'xyz', uses: 0 },
      ]),
    );
    expect(
      await resolveUsedInviteCode(
        fakeGuild('increase', [
          { code: 'abc', uses: 4 },
          { code: 'xyz', uses: 0 },
        ]),
      ),
    ).toBe('abc');
  });

  it('does not guess whether a missing invite was consumed or revoked', async () => {
    await warmInviteCache(fakeGuild('deleted', [{ code: 'once', uses: 0 }]));
    expect(await resolveUsedInviteCode(fakeGuild('deleted', []))).toBeNull();
  });

  it('returns null when no invite use count changed', async () => {
    await warmInviteCache(fakeGuild('unchanged', [{ code: 'abc', uses: 1 }]));
    expect(
      await resolveUsedInviteCode(fakeGuild('unchanged', [{ code: 'abc', uses: 1 }])),
    ).toBeNull();
  });

  it('rejects multiple increased counters instead of choosing the first', async () => {
    await warmInviteCache(
      fakeGuild('ambiguous', [
        { code: 'a', uses: 0 },
        { code: 'b', uses: 0 },
      ]),
    );
    expect(
      await resolveUsedInviteCode(
        fakeGuild('ambiguous', [
          { code: 'a', uses: 1 },
          { code: 'b', uses: 1 },
        ]),
      ),
    ).toBeNull();
  });

  it('rejects multiple uses of the same invite between snapshots', async () => {
    await warmInviteCache(fakeGuild('burst', [{ code: 'a', uses: 0 }]));
    expect(await resolveUsedInviteCode(fakeGuild('burst', [{ code: 'a', uses: 2 }]))).toBeNull();
  });

  it('rejects a changed counter when another invite disappeared', async () => {
    await warmInviteCache(
      fakeGuild('mixed', [
        { code: 'a', uses: 0 },
        { code: 'b', uses: 0 },
      ]),
    );
    expect(await resolveUsedInviteCode(fakeGuild('mixed', [{ code: 'a', uses: 1 }]))).toBeNull();
  });

  it('does not attribute preexisting uses without a baseline', async () => {
    expect(await resolveUsedInviteCode(fakeGuild('cold', [{ code: 'a', uses: 10 }]))).toBeNull();
    expect(await resolveUsedInviteCode(fakeGuild('cold', [{ code: 'a', uses: 11 }]))).toBe('a');
  });

  it('does not attribute historical uses of newly discovered invites', async () => {
    await warmInviteCache(fakeGuild('new', []));
    expect(await resolveUsedInviteCode(fakeGuild('new', [{ code: 'a', uses: 10 }]))).toBeNull();
  });

  it('serializes concurrent resolutions so a counter is consumed only once', async () => {
    await warmInviteCache(fakeGuild('concurrent', [{ code: 'a', uses: 0 }]));
    const guild = fakeGuild('concurrent', [{ code: 'a', uses: 1 }]);
    expect(await Promise.all([resolveUsedInviteCode(guild), resolveUsedInviteCode(guild)])).toEqual(
      ['a', null],
    );
  });

  it('invalidates snapshots after a fetch failure instead of attributing accumulated uses', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await warmInviteCache(fakeGuild('failed-fetch', [{ code: 'a', uses: 0 }]));
    const guild = {
      id: 'failed-fetch',
      invites: {
        fetch: async () => {
          throw new Error('Unavailable');
        },
      },
    } as unknown as Guild;
    expect(await resolveUsedInviteCode(guild)).toBeNull();
    expect(
      await resolveUsedInviteCode(fakeGuild('failed-fetch', [{ code: 'a', uses: 1 }])),
    ).toBeNull();
    expect(await resolveUsedInviteCode(fakeGuild('failed-fetch', [{ code: 'a', uses: 2 }]))).toBe(
      'a',
    );
    warning.mockRestore();
  });

  it('does not interpret unknown counters as zero', async () => {
    await warmInviteCache(fakeGuild('unknown', [{ code: 'a', uses: null }]));
    expect(await resolveUsedInviteCode(fakeGuild('unknown', [{ code: 'a', uses: 1 }]))).toBeNull();
  });

  it('clears the baseline when a guild leaves or becomes unavailable', async () => {
    await warmInviteCache(fakeGuild('leave', [{ code: 'a', uses: 0 }]));
    clearInviteCache('leave');
    expect(await resolveUsedInviteCode(fakeGuild('leave', [{ code: 'a', uses: 1 }]))).toBeNull();
  });

  it('does not return a stale result if the guild leaves during a fetch', async () => {
    await warmInviteCache(fakeGuild('in-flight', [{ code: 'a', uses: 0 }]));
    let finish!: (invites: Array<{ code: string; uses: number }>) => void;
    const fetched = new Promise<Array<{ code: string; uses: number }>>((resolve) => {
      finish = resolve;
    });
    const guild = { id: 'in-flight', invites: { fetch: () => fetched } } as unknown as Guild;
    const result = resolveUsedInviteCode(guild);
    await Promise.resolve();
    clearInviteCache('in-flight');
    finish([{ code: 'a', uses: 1 }]);
    expect(await result).toBeNull();
  });

  it('records newly created invites without erasing other counters', async () => {
    await warmInviteCache(fakeGuild('created', [{ code: 'a', uses: 0 }]));
    await cacheCreatedInvite('created', 'b', 0);
    expect(
      await resolveUsedInviteCode(
        fakeGuild('created', [
          { code: 'a', uses: 1 },
          { code: 'b', uses: 0 },
        ]),
      ),
    ).toBe('a');
    expect(
      await resolveUsedInviteCode(
        fakeGuild('created', [
          { code: 'a', uses: 1 },
          { code: 'b', uses: 1 },
        ]),
      ),
    ).toBe('b');
    await cacheCreatedInvite('created', 'b', 0);
    expect(
      await resolveUsedInviteCode(
        fakeGuild('created', [
          { code: 'a', uses: 1 },
          { code: 'b', uses: 1 },
        ]),
      ),
    ).toBeNull();
  });

  it('does not share snapshots between guilds with the same invite code', async () => {
    await warmInviteCache(fakeGuild('scope-a', [{ code: 'a', uses: 0 }]));
    await warmInviteCache(fakeGuild('scope-b', [{ code: 'a', uses: 10 }]));
    expect(await resolveUsedInviteCode(fakeGuild('scope-b', [{ code: 'a', uses: 10 }]))).toBeNull();
    expect(await resolveUsedInviteCode(fakeGuild('scope-a', [{ code: 'a', uses: 1 }]))).toBe('a');
  });
});
