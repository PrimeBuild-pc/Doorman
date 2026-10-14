import { describe, expect, it } from 'vitest';
import {
  accountAgeHours,
  canManageGuild,
  hasPermission,
  isSafeAutoRole,
  PERMISSIONS,
  snowflakeToDate,
} from './discord.js';

describe('safe automatic roles', () => {
  const role = { id: 'role', managed: false, permissions: '0' };

  it('accepts ordinary member permissions in REST and bigint representations', () => {
    expect(isSafeAutoRole(role, 'guild')).toBe(true);
    expect(isSafeAutoRole({ ...role, permissions: (1n << 10n) | (1n << 11n) }, 'guild')).toBe(true);
  });

  it('rejects @everyone and integration-managed roles', () => {
    expect(isSafeAutoRole({ ...role, id: 'guild' }, 'guild')).toBe(false);
    expect(isSafeAutoRole({ ...role, managed: true }, 'guild')).toBe(false);
  });

  it.each(Object.entries(PERMISSIONS))('rejects privileged permission %s', (_name, bit) => {
    expect(isSafeAutoRole({ ...role, permissions: bit.toString() }, 'guild')).toBe(false);
    expect(isSafeAutoRole({ ...role, permissions: bit | (1n << 10n) }, 'guild')).toBe(false);
  });

  it.each(['', 'invalid', '-1', '0x8', '1.5', ' 0 '])(
    'fails closed on malformed permissions %s',
    (permissions) => {
      expect(isSafeAutoRole({ ...role, permissions }, 'guild')).toBe(false);
    },
  );
  it('rejects a negative bigint', () => {
    expect(isSafeAutoRole({ ...role, permissions: -1n }, 'guild')).toBe(false);
  });

  it.each(Object.entries(PERMISSIONS))('rejects channel overwrite permission %s', (_name, bit) => {
    expect(isSafeAutoRole(role, 'guild', [{ id: role.id, allow: bit.toString() }])).toBe(false);
    expect(isSafeAutoRole(role, 'guild', [{ id: role.id, allow: bit }])).toBe(false);
  });

  it('accepts ordinary overwrites and ignores overwrites for other roles', () => {
    expect(
      isSafeAutoRole(role, 'guild', [
        { id: role.id, allow: (1n << 10n).toString() },
        { id: role.id, allow: 0n },
        { id: 'other', allow: PERMISSIONS.MANAGE_MESSAGES },
        { id: 'other', allow: 'invalid' },
      ]),
    ).toBe(true);
  });

  it.each(['', 'invalid', '-1', '0x8', '1.5', ' 0 ', -1n])(
    'fails closed on malformed matching overwrite %s',
    (allow) => {
      expect(isSafeAutoRole(role, 'guild', [{ id: role.id, allow }])).toBe(false);
    },
  );
});

describe('discord helpers', () => {
  it('decodes a snowflake to its creation date', () => {
    // Discord's own first snowflake example (id 175928847299117063 -> 2016-04-30T11:18:25.796Z)
    expect(snowflakeToDate('175928847299117063').toISOString()).toBe('2016-04-30T11:18:25.796Z');
  });

  it('flags very new accounts as young', () => {
    const brandNewId = String((BigInt(Date.now()) - 1_420_070_400_000n) << 22n);
    expect(accountAgeHours(brandNewId)).toBeLessThan(1);
  });

  it('checks a permission bit', () => {
    const manageRoles = (1n << 28n).toString();
    expect(hasPermission(manageRoles, 1n << 28n)).toBe(true);
    expect(hasPermission(manageRoles, 1n << 3n)).toBe(false);
  });

  it('grants guild management to the owner regardless of permission bits', () => {
    expect(canManageGuild('0', true)).toBe(true);
    expect(canManageGuild('0', false)).toBe(false);
    expect(canManageGuild((1n << 5n).toString(), false)).toBe(true);
  });
});
