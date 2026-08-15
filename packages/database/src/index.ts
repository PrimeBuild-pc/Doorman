import { PrismaClient } from '@prisma/client';

// One client per process (bot, web), reused across calls instead of opening a new
// pool per request — the standard Prisma singleton pattern.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export * from '@prisma/client';
