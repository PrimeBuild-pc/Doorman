import { describe, expect, it } from 'vitest';
import { accountAgeHours, canManageGuild, hasPermission, snowflakeToDate } from './discord.js';

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
