// Minimal Discord permission-bit and snowflake helpers shared by the bot and the
// dashboard. Kept as bigint bitfields (Discord's own representation) rather than a
// name list, same reasoning D-View's schema uses: a name list silently drops any
// permission Discord adds later.

export const PERMISSIONS = {
  MANAGE_ROLES: 1n << 28n,
  MANAGE_GUILD: 1n << 5n,
  ADMINISTRATOR: 1n << 3n,
} as const;

export function hasPermission(permissions: string | bigint, bit: bigint): boolean {
  return (BigInt(permissions) & bit) === bit;
}

export function canManageGuild(permissions: string, owner: boolean): boolean {
  return owner || hasPermission(permissions, PERMISSIONS.ADMINISTRATOR) || hasPermission(permissions, PERMISSIONS.MANAGE_GUILD);
}

const DISCORD_EPOCH = 1_420_070_400_000n;

/** Account-creation timestamp encoded in a Discord snowflake ID. */
export function snowflakeToDate(id: string): Date {
  const ms = (BigInt(id) >> 22n) + DISCORD_EPOCH;
  return new Date(Number(ms));
}

export function accountAgeHours(id: string): number {
  return (Date.now() - snowflakeToDate(id).getTime()) / (1000 * 60 * 60);
}
