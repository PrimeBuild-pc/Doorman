import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { canManageGuild } from '@doorman/shared';

// Ported from D-View's apps/web/src/lib/session.ts: a signed cookie (HMAC over a
// base64url payload) instead of an external session store or NextAuth — Doorman's
// dashboard has the exact same "OAuth-login, list manageable guilds" need D-View
// already solved.

export interface DiscordSession {
  user: { id: string; username: string; avatar?: string | null };
  guilds: DiscordUserGuild[];
  accessToken: string;
  createdAt: number;
}

export interface DiscordUserGuild {
  id: string;
  name: string;
  icon?: string | null;
  owner: boolean;
  permissions: string;
}

const cookieName = 'doorman_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      'AUTH_SECRET is missing or too short. Generate one with `openssl rand -base64 32` and set it in your .env file (minimum 32 characters).',
    );
  }
  return value;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function signaturesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function encodeSession(session: DiscordSession): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(value?: string): DiscordSession | null {
  if (!value) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature || !signaturesMatch(sign(payload), signature)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as DiscordSession;
    if (typeof session.createdAt !== 'number' || Date.now() - session.createdAt > SESSION_MAX_AGE_SECONDS * 1000) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<DiscordSession | null> {
  return decodeSession((await cookies()).get(cookieName)?.value);
}

export async function setSession(session: DiscordSession): Promise<void> {
  (await cookies()).set(cookieName, encodeSession(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(cookieName);
}

export function manageableGuilds(session: DiscordSession): DiscordUserGuild[] {
  return session.guilds.filter((g) => canManageGuild(g.permissions, g.owner));
}
