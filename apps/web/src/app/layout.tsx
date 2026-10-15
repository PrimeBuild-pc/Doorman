import type { Metadata } from 'next';
import './globals.css';
import { locales, translate } from '@doorman/shared';
import { getLocale } from '@/lib/locale';
import { LocaleProvider } from './locale-provider';
import { changeLocale } from './locale-action';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Doorman', description: translate(await getLocale(), 'description') };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const names = { en: 'English', it: 'Italiano', es: 'Español', ru: 'Русский', zh: '中文' };
  return (
    <html lang={locale}>
      <body>
        <a className="skip-link" href="#main-content">
          {translate(locale, 'skip')}
        </a>
        <form
          action={changeLocale}
          className="mx-auto flex max-w-2xl flex-wrap items-center gap-3 px-4 pt-4 sm:px-8"
        >
          <label htmlFor="locale">{translate(locale, 'language')}</label>
          <select
            key={locale}
            id="locale"
            name="locale"
            defaultValue={locale}
            className="rounded border border-gray-600 bg-gray-900 p-2"
          >
            {locales.map((value) => (
              <option key={value} value={value} lang={value}>
                {names[value]}
              </option>
            ))}
          </select>
          <button type="submit" className="min-h-11 rounded px-3 py-2 hover:bg-gray-800">
            {translate(locale, 'applyLanguage')}
          </button>
        </form>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
