'use server';

import { cookies } from 'next/headers';
import { isLocale, localeCookieName } from '@doorman/shared';
import { publicOrigin } from '@/lib/session';

export async function changeLocale(formData: FormData): Promise<void> {
  const locale = formData.get('locale');
  if (!isLocale(locale)) return;
  (await cookies()).set(localeCookieName, locale, {
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(publicOrigin()).protocol === 'https:',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}
