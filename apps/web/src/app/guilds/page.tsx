import { redirect } from 'next/navigation';
import { prisma } from '@doorman/database';
import { getSession } from '@/lib/session';
import { manageableGuilds } from '@/lib/discordApi';
import { translate } from '@doorman/shared';
import { getLocale } from '@/lib/locale';

export default async function GuildsPage() {
  const locale = await getLocale();
  const session = await getSession();
  if (!session) redirect('/api/auth/login');

  const candidates = await manageableGuilds(session);
  const installed = await prisma.guild.findMany({
    where: { id: { in: candidates.map((g) => g.id) } },
    select: { id: true },
  });
  const installedIds = new Set(installed.map((g) => g.id));

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl px-4 py-8 sm:px-8">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{translate(locale, 'servers')}</h1>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="rounded px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            {translate(locale, 'logout')}
          </button>
        </form>
      </header>
      <p className="mb-6 text-sm text-gray-300">{translate(locale, 'chooseServer')}</p>

      <ul className="space-y-2">
        {candidates.map((guild) => {
          const active = installedIds.has(guild.id);
          return (
            <li
              key={guild.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4"
            >
              <span className="min-w-0 break-words font-medium">{guild.name}</span>
              {active ? (
                <a
                  href={`/guilds/${guild.id}`}
                  aria-label={translate(locale, 'configureServer', { name: guild.name })}
                  className="rounded py-2 text-amber-400 hover:underline"
                >
                  {translate(locale, 'configure')}
                </a>
              ) : (
                <span className="text-sm text-gray-400">{translate(locale, 'inviteBot')}</span>
              )}
            </li>
          );
        })}
      </ul>

      {candidates.length === 0 && <p className="text-gray-400">{translate(locale, 'noServers')}</p>}
    </main>
  );
}
