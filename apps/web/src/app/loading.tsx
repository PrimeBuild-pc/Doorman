'use client';

import { translate } from '@doorman/shared';
import { useLocale } from './locale-provider';

export default function Loading() {
  const locale = useLocale();
  return (
    <main
      id="main-content"
      tabIndex={-1}
      aria-busy="true"
      className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-8"
    >
      <h1 className="text-2xl font-bold">Doorman</h1>
      <p role="status" className="text-gray-300">
        {translate(locale, 'loading')}
      </p>
    </main>
  );
}
