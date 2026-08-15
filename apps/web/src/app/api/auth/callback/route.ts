import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@doorman/shared';
import { setSession, type DiscordUserGuild } from '@/lib/session';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/api/auth/login', request.url));

  const env = getEnv();
  const redirectUri = `${env.PUBLIC_URL}/api/auth/callback`;

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
  });
  if (!tokenRes.ok) {
    return NextResponse.json({ error: 'Discord token exchange failed' }, { status: 502 });
  }
  const token = (await tokenRes.json()) as { access_token: string };

  const [user, guilds] = await Promise.all([
    fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    }).then((r) => r.json()) as Promise<{ id: string; username: string; avatar: string | null }>,
    fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    }).then((r) => r.json()) as Promise<DiscordUserGuild[]>,
  ]);

  await setSession({
    user: { id: user.id, username: user.username, avatar: user.avatar },
    guilds,
    accessToken: token.access_token,
    createdAt: Date.now(),
  });

  return NextResponse.redirect(new URL('/guilds', request.url));
}
