import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { localeCookieName, locales } from '@doorman/shared';

const mocks = vi.hoisted(() => ({
  values: new Map<string, string>(),
  set: vi.fn(),
  headers: new Headers(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: mocks.values.get(name) }),
    set: mocks.set,
  }),
  headers: async () => mocks.headers,
}));
vi.mock('@/lib/session', () => ({ publicOrigin: () => 'https://dashboard.example' }));

import { getLocale, requestLocale } from './locale';
import { changeLocale } from '@/app/locale-action';

beforeEach(() => {
  mocks.values.clear();
  mocks.set
    .mockReset()
    .mockImplementation((name: string, value: string) => mocks.values.set(name, value));
  mocks.headers = new Headers({ 'accept-language': 'es-ES, en;q=0.5' });
});

describe('dashboard locale persistence', () => {
  it.each(locales)('persists %s and uses it for subsequent requests', async (locale) => {
    expect(await getLocale()).toBe('es');
    const form = new FormData();
    form.set('locale', locale);
    await changeLocale(form);
    expect(mocks.set).toHaveBeenCalledWith(localeCookieName, locale, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 31_536_000,
    });
    expect(await getLocale()).toBe(locale);
  });

  it.each(['__proto__', 'constructor', 'it-IT', 'xx', '<script>', 'EN', ''])(
    'ignores unsafe preference %s',
    async (value) => {
      mocks.values.set(localeCookieName, 'ru');
      const form = new FormData();
      form.set('locale', value);
      await changeLocale(form);
      expect(mocks.set).not.toHaveBeenCalled();
      expect(await getLocale()).toBe('ru');
    },
  );

  it('ignores missing and file values', async () => {
    await changeLocale(new FormData());
    const form = new FormData();
    form.set('locale', new File(['ru'], 'locale'));
    await changeLocale(form);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('uses identical negotiation for HTML and API requests with English fallback', async () => {
    const request = (cookie: string, language: string) =>
      new NextRequest('https://dashboard.example', {
        headers: { cookie: `${localeCookieName}=${cookie}`, 'accept-language': language },
      });
    expect(requestLocale(request('en', 'ru'))).toBe('en');
    expect(requestLocale(request('__proto__', 'zh-TW'))).toBe('zh');
    expect(requestLocale(request('', 'de-DE'))).toBe('en');
    mocks.values.set(localeCookieName, 'unsupported');
    expect(await getLocale()).toBe('es');
    mocks.headers = new Headers();
    expect(await getLocale()).toBe('en');
  });
});
