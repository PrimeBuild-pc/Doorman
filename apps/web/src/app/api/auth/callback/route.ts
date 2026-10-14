import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@doorman/shared';
import { consumeOAuthState, publicOrigin, setSession } from '@/lib/session';
import { z } from 'zod';

const tokenSchema = z.object({
  access_token: z.string().min(1).max(2048),
  expires_in: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER / 1000),
});
const userSchema = z.object({
  id: z.string().regex(/^\d{1,20}$/),
  username: z.string().min(1).max(100),
  avatar: z.string().max(100).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get('state');
  if (!(await consumeOAuthState(state))) {
    return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 });
  }
  const code = request.nextUrl.searchParams.get('code');
  if (!code || request.nextUrl.searchParams.has('error')) {
    return NextResponse.redirect(new URL('/', publicOrigin()));
  }

  const env = getEnv();
  const redirectUri = `${publicOrigin()}/api/auth/callback`;

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
      redirect: 'error',
    });
    if (!tokenRes.ok) throw new Error('Token exchange failed');
    const token = tokenSchema.parse(await tokenRes.json());
    const createdAt = Date.now();
    const expiresAt = createdAt + token.expires_in * 1000;
    if (!Number.isSafeInteger(expiresAt)) throw new Error('Invalid token expiry');

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
      redirect: 'error',
    });
    if (!userRes.ok) throw new Error('User lookup failed');
    const user = userSchema.parse(await userRes.json());

    await setSession({ user, accessToken: token.access_token, createdAt, expiresAt });
    return NextResponse.redirect(new URL('/guilds', publicOrigin()));
  } catch {
    // Never expose upstream bodies, tokens, validation input or network error details.
    return NextResponse.json({ error: 'Discord authentication failed' }, { status: 502 });
  }
}
