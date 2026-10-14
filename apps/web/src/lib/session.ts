import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { z } from 'zod';

export interface DiscordSession {
  user: { id: string; username: string; avatar?: string | null };
  accessToken: string;
  createdAt: number;
  expiresAt?: number;
}

export interface DiscordUserGuild {
  id: string;
  name: string;
  icon?: string | null;
  owner: boolean;
  permissions: string;
}

const cookieName = 'doorman_session';
const stateCookieName = 'doorman_oauth_state';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10;

const sessionSchema = z.object({
  user: z.object({
    id: z.string().regex(/^\d{1,20}$/),
    username: z.string().min(1).max(100),
    avatar: z.string().max(100).nullable().optional(),
  }),
  accessToken: z.string().min(1).max(2048),
  createdAt: z.number().int().positive(),
  expiresAt: z.number().int().positive().optional(),
});

function key(): Buffer {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error('AUTH_SECRET must contain at least 32 characters');
  }
  return crypto.createHash('sha256').update(value).digest();
}

export function publicOrigin(): string {
  const url = new URL(process.env.PUBLIC_URL ?? '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('PUBLIC_URL must be an HTTP(S) origin');
  }
  return url.origin;
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: new URL(publicOrigin()).protocol === 'https:',
    path: '/',
    maxAge,
  };
}

function expiry(session: DiscordSession): number {
  return Math.min(
    session.createdAt + SESSION_MAX_AGE_SECONDS * 1000,
    session.expiresAt ?? Infinity,
  );
}

function validAt(session: DiscordSession, now: number): boolean {
  return session.createdAt <= now && expiry(session) > now;
}

export function encodeSession(session: DiscordSession): string {
  // Project only the authenticated fields; never persist guild lists or extra OAuth data.
  const payload = sessionSchema.parse(session);
  if (!validAt(payload, Date.now())) throw new Error('Invalid session lifetime');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(cookieName));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}

export function decodeSession(value?: string): DiscordSession | null {
  if (!value || value.length > 4096) return null;
  const parts = value.split('.');
  if (
    parts.length !== 4 ||
    parts[0] !== 'v1' ||
    parts
      .slice(1)
      .some(
        (part) =>
          !/^[\w-]+$/.test(part) || Buffer.from(part, 'base64url').toString('base64url') !== part,
      )
  ) {
    return null;
  }
  try {
    const [, iv, ciphertext, tag] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv!, 'base64url'));
    if (Buffer.from(iv!, 'base64url').length !== 12 || Buffer.from(tag!, 'base64url').length !== 16)
      return null;
    decipher.setAAD(Buffer.from(cookieName));
    decipher.setAuthTag(Buffer.from(tag!, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext!, 'base64url')),
      decipher.final(),
    ]);
    const parsed = sessionSchema.safeParse(JSON.parse(plaintext.toString('utf8')));
    return parsed.success && validAt(parsed.data, Date.now()) ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<DiscordSession | null> {
  return decodeSession((await cookies()).get(cookieName)?.value);
}

export async function setSession(session: DiscordSession): Promise<void> {
  const value = encodeSession(session);
  (await cookies()).set(
    cookieName,
    value,
    cookieOptions(Math.floor((expiry(session) - Date.now()) / 1000)),
  );
}

export async function clearSession(): Promise<void> {
  (await cookies()).set(cookieName, '', cookieOptions(0));
}

export async function createOAuthState(): Promise<string> {
  const state = `${Date.now()}.${crypto.randomBytes(32).toString('base64url')}`;
  (await cookies()).set(stateCookieName, state, cookieOptions(OAUTH_STATE_MAX_AGE_SECONDS));
  return state;
}

export async function consumeOAuthState(state: string | null): Promise<boolean> {
  const store = await cookies();
  const expected = store.get(stateCookieName)?.value;
  // Consume even failed/denied callbacks so the browser cannot reuse the login attempt.
  store.set(stateCookieName, '', cookieOptions(0));
  if (
    !state ||
    !expected ||
    !/^\d{13}\.[\w-]{43}$/.test(state) ||
    !/^\d{13}\.[\w-]{43}$/.test(expected)
  )
    return false;
  const createdAt = Number(state.split('.')[0]);
  const age = Date.now() - createdAt;
  return (
    age >= 0 &&
    age < OAUTH_STATE_MAX_AGE_SECONDS * 1000 &&
    crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected))
  );
}
