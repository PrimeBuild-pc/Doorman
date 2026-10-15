import { cookies, headers } from 'next/headers';
import { localeCookieName, selectLocale } from '@doorman/shared';
import type { NextRequest } from 'next/server';

export async function getLocale() {
  const [store, requestHeaders] = await Promise.all([cookies(), headers()]);
  return selectLocale(store.get(localeCookieName)?.value, requestHeaders.get('accept-language'));
}

export function requestLocale(request: NextRequest) {
  return selectLocale(
    request.cookies.get(localeCookieName)?.value,
    request.headers.get('accept-language'),
  );
}
