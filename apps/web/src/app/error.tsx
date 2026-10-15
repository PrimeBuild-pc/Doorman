'use client';

import { translate } from '@doorman/shared';
import { useLocale } from './locale-provider';

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useLocale();
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-bold">{translate(locale, 'unavailable')}</h1>
      <p role="alert" className="text-gray-300">
        {translate(locale, 'loadError')}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded bg-amber-500 px-4 py-2 font-medium text-gray-950 hover:bg-amber-400"
        >
          {translate(locale, 'retry')}
        </button>
        <a href="/guilds" className="rounded py-2 text-amber-400 hover:underline">
          {translate(locale, 'allServers')}
        </a>
        <a href="/api/auth/login" className="rounded py-2 text-amber-400 hover:underline">
          {translate(locale, 'login')}
        </a>
      </div>
    </main>
  );
}
