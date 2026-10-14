// Minimal Discord permission-bit and snowflake helpers shared by the bot and the
// dashboard. Kept as bigint bitfields (Discord's own representation) rather than a
// name list, same reasoning D-View's schema uses: a name list silently drops any
// permission Discord adds later.

export const PERMISSIONS = {
  MANAGE_ROLES: 1n << 28n,
  MANAGE_GUILD: 1n << 5n,
  ADMINISTRATOR: 1n << 3n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  MANAGE_CHANNELS: 1n << 4n,
  VIEW_AUDIT_LOG: 1n << 7n,
  MANAGE_MESSAGES: 1n << 13n,
  MENTION_EVERYONE: 1n << 17n,
  MUTE_MEMBERS: 1n << 22n,
  DEAFEN_MEMBERS: 1n << 23n,
  MOVE_MEMBERS: 1n << 24n,
  MANAGE_WEBHOOKS: 1n << 29n,
  MANAGE_GUILD_EXPRESSIONS: 1n << 30n,
  MANAGE_EVENTS: 1n << 33n,
  MANAGE_THREADS: 1n << 34n,
  MODERATE_MEMBERS: 1n << 40n,
  PIN_MESSAGES: 1n << 51n,
} as const;

const UNSAFE_AUTO_ROLE_PERMISSIONS = Object.values(PERMISSIONS).reduce(
  (mask, bit) => mask | bit,
  0n,
);

/** Callers must supply all channel overwrites and check guild membership and bot hierarchy. */
export function isSafeAutoRole(
  role: { id: string; managed: boolean; permissions: string | bigint },
  guildId: string,
  overwrites: Array<{ id: string; allow: string | bigint }> = [],
): boolean {
  if (role.id === guildId || role.managed !== false) return false;
  try {
    const bitfields = [
      role.permissions,
      ...overwrites.filter((o) => o.id === role.id).map((o) => o.allow),
    ];
    for (const bitfield of bitfields) {
      if (typeof bitfield !== 'bigint' && (typeof bitfield !== 'string' || !/^\d+$/.test(bitfield)))
        return false;
      const permissions = BigInt(bitfield);
      if (permissions < 0n || (permissions & UNSAFE_AUTO_ROLE_PERMISSIONS) !== 0n) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function hasPermission(permissions: string | bigint, bit: bigint): boolean {
  return (BigInt(permissions) & bit) === bit;
}

export function canManageGuild(permissions: string, owner: boolean): boolean {
  return (
    owner ||
    hasPermission(permissions, PERMISSIONS.ADMINISTRATOR) ||
    hasPermission(permissions, PERMISSIONS.MANAGE_GUILD)
  );
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
