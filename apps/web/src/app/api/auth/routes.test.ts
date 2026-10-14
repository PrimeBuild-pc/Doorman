import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as login } from './login/route';
import { GET as callback } from './callback/route';
import { POST as logout } from './logout/route';
import { decodeSession } from '../../../lib/session';

vi.mock('@/lib/session', async () => import('../../../lib/session'));
vi.mock('@doorman/shared', () => ({
  getEnv: () => ({ DISCORD_CLIENT_ID: 'test-client', DISCORD_CLIENT_SECRET: 'test-client-secret' }),
}));
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

const fetchMock = vi.fn();
const now = new Date('2026-01-01T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv('AUTH_SECRET', 'test-secret-that-is-at-least-thirty-two-characters');
  vi.stubEnv('PUBLIC_URL', 'https://dashboard.example/');
  vi.stubGlobal('fetch', fetchMock);
  store.values.clear();
  vi.clearAllMocks();
  fetchMock.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function beginLogin(): Promise<string> {
  const response = await login();
  const url = new URL(response.headers.get('location')!);
  return url.searchParams.get('state')!;
}
function callbackRequest(state: string | null, extra = 'code=test-code') {
  const query = state ? `state=${encodeURIComponent(state)}&${extra}` : extra;
  return new NextRequest(`http://internal-proxy:3000/api/auth/callback?${query}`);
}
function succeed() {
  fetchMock.mockResolvedValueOnce(
    Response.json({ access_token: 'private-token', expires_in: 3600, refresh_token: 'discard-me' }),
  );
  fetchMock.mockResolvedValueOnce(
    Response.json({ id: '123', username: 'alice', avatar: null, email: 'discard@example.com' }),
  );
}

describe('OAuth routes', () => {
  it('login sends random state and canonical callback URI to Discord', async () => {
    const response = await login();
    expect(response.status).toBe(307);
    const url = new URL(response.headers.get('location')!);
    expect(url.origin + url.pathname).toBe('https://discord.com/api/oauth2/authorize');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://dashboard.example/api/auth/callback',
    );
    expect(url.searchParams.get('scope')).toBe('identify guilds');
    expect(url.searchParams.get('state')).toBe(store.values.get('doorman_oauth_state'));
    const first = url.searchParams.get('state');
    expect(await beginLogin()).not.toBe(first);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, 'wrong-state'])(
    'rejects missing or mismatched state before token exchange',
    async (state) => {
      await beginLogin();
      const response = await callback(callbackRequest(state));
      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(store.values.has('doorman_oauth_state')).toBe(false);
    },
  );

  it('consumes valid state on denial and redirects to PUBLIC_URL without reflecting errors', async () => {
    const state = await beginLogin();
    const response = await callback(callbackRequest(state, 'error=private-error'));
    expect(response.headers.get('location')).toBe('https://dashboard.example/');
    expect(store.values.has('doorman_oauth_state')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await callback(callbackRequest(state))).status).toBe(400);
  });

  it('sets a minimized encrypted session and redirects canonically without fetching guilds', async () => {
    const state = await beginLogin();
    succeed();
    const response = await callback(callbackRequest(state));
    expect(response.headers.get('location')).toBe('https://dashboard.example/guilds');
    expect(response.status).toBe(307);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://discord.com/api/oauth2/token',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        cache: 'no-store',
        redirect: 'error',
      }),
    );
    const body = fetchMock.mock.calls[0]![1].body as URLSearchParams;
    expect(body.get('redirect_uri')).toBe('https://dashboard.example/api/auth/callback');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://discord.com/api/users/@me',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        cache: 'no-store',
        redirect: 'error',
        headers: { Authorization: 'Bearer private-token' },
      }),
    );
    expect(decodeSession(store.values.get('doorman_session'))).toEqual({
      user: { id: '123', username: 'alice', avatar: null },
      accessToken: 'private-token',
      createdAt: now,
      expiresAt: now + 3600_000,
    });
    expect((await callback(callbackRequest(state))).status).toBe(400);
  });

  it.each([400, 401, 429, 500])('sanitizes failed token exchange status %s', async (status) => {
    const state = await beginLogin();
    fetchMock.mockResolvedValueOnce(new Response('private-token-and-client-secret', { status }));
    const response = await callback(callbackRequest(state));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Discord authentication failed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.values.has('doorman_session')).toBe(false);
    expect(store.values.has('doorman_oauth_state')).toBe(false);
  });

  it('rejects failed user lookup without leaking its body or setting a session', async () => {
    const state = await beginLogin();
    fetchMock.mockResolvedValueOnce(
      Response.json({ access_token: 'private-token', expires_in: 3600 }),
    );
    fetchMock.mockResolvedValueOnce(new Response('private-user-details', { status: 401 }));
    const response = await callback(callbackRequest(state));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Discord authentication failed' });
    expect(store.values.has('doorman_session')).toBe(false);
  });

  it.each([
    { access_token: '', expires_in: 3600 },
    { access_token: 'private-token', expires_in: 0 },
    { access_token: 'private-token' },
    { access_token: 'private-token', expires_in: '3600' },
  ])('rejects malformed token data %#', async (payload) => {
    const state = await beginLogin();
    fetchMock.mockResolvedValueOnce(Response.json(payload));
    const response = await callback(callbackRequest(state));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private-token');
    expect(store.values.has('doorman_session')).toBe(false);
  });

  it('sanitizes malformed JSON and network failures', async () => {
    let state = await beginLogin();
    fetchMock.mockResolvedValueOnce(new Response('invalid-private-json'));
    expect((await callback(callbackRequest(state))).status).toBe(502);
    state = await beginLogin();
    fetchMock.mockRejectedValueOnce(new Error('private upstream credentials'));
    const response = await callback(callbackRequest(state));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Discord authentication failed' });
  });

  it('bounds fetches with a ten-second abort and sanitizes timeout details', async () => {
    const state = await beginLogin();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error('private timeout detail')), 10_000);
      return controller.signal;
    });
    fetchMock.mockImplementationOnce(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal!.addEventListener('abort', () => reject(options.signal!.reason));
        }),
    );
    const pending = callback(callbackRequest(state));
    await vi.advanceTimersByTimeAsync(10_000);
    const response = await pending;
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Discord authentication failed' });
    expect(store.values.has('doorman_session')).toBe(false);
    timeout.mockRestore();
  });
});

describe('logout', () => {
  it.each([undefined, 'null', 'https://attacker.example', 'http://internal-proxy:3000'])(
    'rejects untrusted Origin %s',
    async (origin) => {
      store.values.set('doorman_session', 'existing-session');
      const request = new NextRequest('http://internal-proxy:3000/api/auth/logout', {
        method: 'POST',
        headers: origin ? { origin } : {},
      });
      const response = await logout(request);
      expect(response.status).toBe(403);
      expect(store.values.get('doorman_session')).toBe('existing-session');
      expect(store.set).not.toHaveBeenCalled();
    },
  );

  it('clears the cookie for same-origin POST and redirects using 303 and PUBLIC_URL', async () => {
    store.values.set('doorman_session', 'existing-session');
    const request = new NextRequest('http://internal-proxy:3000/api/auth/logout', {
      method: 'POST',
      headers: { origin: 'https://dashboard.example' },
    });
    const response = await logout(request);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://dashboard.example/');
    expect(store.values.has('doorman_session')).toBe(false);
    expect(store.set).toHaveBeenLastCalledWith(
      'doorman_session',
      '',
      expect.objectContaining({
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      }),
    );
  });
});
