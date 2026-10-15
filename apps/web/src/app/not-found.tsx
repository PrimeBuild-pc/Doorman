'use client';

import { translate } from '@doorman/shared';
import { useLocale } from './locale-provider';

export default function NotFound() {
  const locale = useLocale();
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-bold">{translate(locale, 'notFound')}</h1>
      <p>{translate(locale, 'notFoundHelp')}</p>
      <a href="/guilds" className="rounded py-2 text-amber-400 hover:underline">
        {translate(locale, 'allServers')}
      </a>
    </main>
  );
}
