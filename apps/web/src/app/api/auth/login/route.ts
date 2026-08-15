import { NextResponse } from 'next/server';
import { getEnv } from '@doorman/shared';

export function GET() {
  const env = getEnv();
  const redirectUri = `${env.PUBLIC_URL}/api/auth/callback`;
  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', env.DISCORD_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify guilds');
  return NextResponse.redirect(url.toString());
}
