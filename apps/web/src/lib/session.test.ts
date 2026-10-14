import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSession,
  consumeOAuthState,
  createOAuthState,
  decodeSession,
  encodeSession,
  getSession,
  OAUTH_STATE_MAX_AGE_SECONDS,
  publicOrigin,
  SESSION_MAX_AGE_SECONDS,
  setSession,
  type DiscordSession,
} from './session';

const store = vi.hoisted(() => ({
  values: new Map<string, string>(),
  get: vi.fn((name: string): { value: string } | undefined => {
    const value = store.values.get(name);
    return value === undefined ? undefined : { value };
  }),
  set: vi.fn((name: string, value: string) => {
    if (value) store.values.set(name, value);
    else store.values.delete(name);
  }),
}));
vi.mock('next/headers', () => ({ cookies: async () => store }));

const now = new Date('2026-01-01T12:00:00Z').getTime();
function session(): DiscordSession {
  return {
    user: { id: '123456789', username: 'alice', avatar: null },
    accessToken: 'private-bearer-token',
    createdAt: now,
    expiresAt: now + 3600_000,
  };
}

// Produce authenticated but invalid payloads to exercise the trust boundary after decryption.
function encryptPayload(payload: unknown): string {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(process.env.AUTH_SECRET!).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('doorman_session'));
  const data = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    data.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv('AUTH_SECRET', 'test-secret-that-is-at-least-thirty-two-characters');
  vi.stubEnv('PUBLIC_URL', 'https://dashboard.example');
  store.values.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('encrypted sessions', () => {
  it('round trips with fresh IVs and stores neither guilds nor plaintext tokens', () => {
    const input = {
      ...session(),
      guilds: [{ id: '1', name: 'guild' }],
      refresh_token: 'discard-me',
    };
    const encoded = encodeSession(input);
    expect(decodeSession(encoded)).toEqual(session());
    expect(encoded).not.toBe(encodeSession(input));
    expect(encoded).not.toContain(input.accessToken);
    expect(encoded).not.toContain(input.user.username);
    expect(Buffer.from(encoded.split('.')[2]!, 'base64url').toString()).not.toContain(
      input.accessToken,
    );
  });

  it('rejects tampered IV, ciphertext, tag and version, wrong keys and old signed cookies', () => {
    const encoded = encodeSession(session());
    for (const index of [0, 1, 2, 3]) {
      const parts = encoded.split('.');
      parts[index] = (parts[index]![0] === 'A' ? 'B' : 'A') + parts[index]!.slice(1);
      expect(decodeSession(parts.join('.'))).toBeNull();
    }
    const parts = encoded.split('.');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const tag = parts[3]!;
    parts[3] = tag.slice(0, -1) + alphabet[alphabet.indexOf(tag.at(-1)!) + 1];
    expect(decodeSession(parts.join('.'))).toBeNull();
    expect(decodeSession(`${encoded}.extra`)).toBeNull();
    expect(decodeSession('e30.legacy-signature')).toBeNull();
    expect(decodeSession()).toBeNull();
    expect(decodeSession('v1.invalid.invalid.invalid')).toBeNull();
    vi.stubEnv('AUTH_SECRET', 'different-secret-with-at-least-thirty-two-characters');
    expect(decodeSession(encoded)).toBeNull();
  });

  it('expires at the token lifetime and caps sessions at seven days', () => {
    const encoded = encodeSession(session());
    vi.setSystemTime(now + 3600_000 - 1);
    expect(decodeSession(encoded)).not.toBeNull();
    vi.setSystemTime(now + 3600_000);
    expect(decodeSession(encoded)).toBeNull();
    vi.setSystemTime(now);
    const long = encodeSession({ ...session(), expiresAt: now + 30 * 86400_000 });
    const legacy = encodeSession({ ...session(), expiresAt: undefined });
    vi.setSystemTime(now + SESSION_MAX_AGE_SECONDS * 1000);
    expect(decodeSession(long)).toBeNull();
    expect(decodeSession(legacy)).toBeNull();
  });

  it.each([
    null,
    {},
    { ...session(), user: null },
    { ...session(), user: { id: 'not-an-id', username: 'alice' } },
    { ...session(), accessToken: '' },
    { ...session(), accessToken: 1 },
    { ...session(), createdAt: now + 1 },
    { ...session(), createdAt: 'today' },
    { ...session(), createdAt: -1 },
    { ...session(), expiresAt: now },
    { ...session(), expiresAt: 'tomorrow' },
  ])('rejects invalid authenticated payload %#', (payload) => {
    expect(decodeSession(encryptPayload(payload))).toBeNull();
  });

  it('refuses to encode invalid lifetimes or use weak keys', () => {
    expect(() => encodeSession({ ...session(), createdAt: now + 1 })).toThrow();
    expect(() => encodeSession({ ...session(), expiresAt: now })).toThrow();
    vi.stubEnv('AUTH_SECRET', 'short');
    expect(() => encodeSession(session())).toThrow();
  });
});

describe('cookies', () => {
  it('sets HttpOnly Lax cookies scoped to / with a token-bounded age', async () => {
    await setSession(session());
    expect(store.set).toHaveBeenCalledWith('doorman_session', expect.any(String), {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 3600,
    });
    expect(await getSession()).toEqual(session());
    await clearSession();
    expect(store.set).toHaveBeenLastCalledWith('doorman_session', '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 0,
    });
    expect(await getSession()).toBeNull();
  });

  it('uses PUBLIC_URL protocol, not NODE_ENV, for Secure', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PUBLIC_URL', 'http://localhost:3000');
    await setSession({ ...session(), expiresAt: undefined });
    expect(store.set).toHaveBeenLastCalledWith(
      'doorman_session',
      expect.any(String),
      expect.objectContaining({
        secure: false,
        maxAge: SESSION_MAX_AGE_SECONDS,
      }),
    );
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PUBLIC_URL', 'https://dashboard.example/');
    await setSession(session());
    expect(store.set).toHaveBeenLastCalledWith(
      'doorman_session',
      expect.any(String),
      expect.objectContaining({ secure: true }),
    );
    expect(publicOrigin()).toBe('https://dashboard.example');
  });

  it('rejects non-HTTP canonical URLs', () => {
    vi.stubEnv('PUBLIC_URL', 'ftp://dashboard.example');
    expect(publicOrigin).toThrow();
  });
});

describe('OAuth state', () => {
  it('creates random HttpOnly Lax ten-minute state and consumes it once', async () => {
    const state = await createOAuthState();
    expect(store.set).toHaveBeenLastCalledWith('doorman_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 600,
    });
    expect(await consumeOAuthState(state)).toBe(true);
    expect(await consumeOAuthState(state)).toBe(false);
    expect(await createOAuthState()).not.toBe(state);
  });

  it('consumes mismatched and missing state without accepting either', async () => {
    const state = await createOAuthState();
    expect(await consumeOAuthState(`${state.slice(0, -1)}!`)).toBe(false);
    expect(await consumeOAuthState(state)).toBe(false);
    await createOAuthState();
    expect(await consumeOAuthState(null)).toBe(false);
    expect(store.values.has('doorman_oauth_state')).toBe(false);
  });

  it('rejects malformed cookie values without throwing', async () => {
    const state = await createOAuthState();
    store.values.set('doorman_oauth_state', 'é'.repeat(state.length));
    expect(await consumeOAuthState(state)).toBe(false);
  });

  it('rejects expired and future state even when a client resends the cookie', async () => {
    const state = await createOAuthState();
    vi.setSystemTime(now + OAUTH_STATE_MAX_AGE_SECONDS * 1000);
    expect(await consumeOAuthState(state)).toBe(false);
    vi.setSystemTime(now);
    const future = await createOAuthState();
    vi.setSystemTime(now - 1);
    expect(await consumeOAuthState(future)).toBe(false);
  });
});
