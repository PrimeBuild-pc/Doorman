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
        <header className="border-b border-white/10 bg-black/20 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
            <a href="/guilds" className="flex items-center gap-2 font-semibold text-white">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none">
                <rect
                  x="4"
                  y="2.5"
                  width="16"
                  height="19"
                  rx="2.5"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <circle cx="15" cy="12" r="1.5" fill="currentColor" />
              </svg>
              Doorman
            </a>
            <form action={changeLocale} className="flex items-center gap-2 text-sm">
              <label htmlFor="locale" className="sr-only">
                {translate(locale, 'language')}
              </label>
              <select
                key={locale}
                id="locale"
                name="locale"
                defaultValue={locale}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5"
              >
                {locales.map((value) => (
                  <option key={value} value={value} lang={value}>
                    {names[value]}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="min-h-9 rounded-lg px-3 py-1.5 text-gray-300 hover:bg-white/5 hover:text-white"
              >
                {translate(locale, 'applyLanguage')}
              </button>
            </form>
          </div>
        </header>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
