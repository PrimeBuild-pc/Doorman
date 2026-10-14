import { NextRequest, NextResponse } from 'next/server';
import { clearSession, publicOrigin } from '@/lib/session';

export async function POST(request: NextRequest) {
  const origin = publicOrigin();
  if (request.headers.get('origin') !== origin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await clearSession();
  return NextResponse.redirect(new URL('/', origin), 303);
}
