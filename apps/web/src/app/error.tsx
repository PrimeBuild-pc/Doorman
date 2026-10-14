'use client';

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-bold">Dashboard unavailable</h1>
      <p role="alert" className="text-gray-300">
        We couldn&apos;t load this page or complete your change. Check your server permissions and
        Doorman&apos;s access in Discord. If you submitted a change, check its result before trying
        again.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded bg-amber-500 px-4 py-2 font-medium text-gray-950 hover:bg-amber-400"
        >
          Try again
        </button>
        <a href="/guilds" className="rounded py-2 text-amber-400 hover:underline">
          All servers
        </a>
        <a href="/api/auth/login" className="rounded py-2 text-amber-400 hover:underline">
          Log in again
        </a>
      </div>
    </main>
  );
}
